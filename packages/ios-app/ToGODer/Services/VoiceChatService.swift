import Foundation
import AVFoundation
import Speech
import Combine

@MainActor
final class VoiceChatService: NSObject, ObservableObject {
    enum AuthStatus { case notDetermined, authorized, denied }

    @Published var isListening = false
    @Published var isSpeaking = false
    @Published var transcript = ""
    @Published var authorizationStatus: AuthStatus = .notDetermined
    @Published var lastError: String?

    private let recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    let ttsEngine = KittenTTSEngine()

    private var silenceTimer: Timer?
    private var onSilence: (() -> Void)?
    private var lastTranscriptChange: Date = .distantPast

    // Sentence-level streaming TTS
    private var spokenPrefixLength: Int = 0
    private var speechQueue: [String] = []
    private var isPlayingQueue = false
    private var pregenerated: [Float]?
    private var pregeneratingText: String?

    override init() {
        self.recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        super.init()
    }

    // MARK: - Permissions

    func requestPermissions() async -> Bool {
        let speech: SFSpeechRecognizerAuthorizationStatus = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
        let mic: Bool = await withCheckedContinuation { cont in
            AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
        }
        let ok = (speech == .authorized) && mic
        authorizationStatus = ok ? .authorized : .denied
        return ok
    }

    // MARK: - Listening (STT via Apple Speech)

    func startListening(onSilenceDetected: @escaping () -> Void) throws {
        guard !isListening else { return }
        guard let recognizer, recognizer.isAvailable else {
            lastError = "Speech recognizer unavailable for \(Locale.current.identifier)."
            throw NSError(domain: "VoiceChat", code: 1, userInfo: [NSLocalizedDescriptionKey: lastError ?? "Unavailable"])
        }
        stopSpeaking()
        onSilence = onSilenceDetected
        transcript = ""
        lastTranscriptChange = Date()

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            req.requiresOnDeviceRecognition = true
        }
        self.request = req

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            req.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
        isListening = true

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    let text = result.bestTranscription.formattedString
                    if text != self.transcript {
                        self.transcript = text
                        self.lastTranscriptChange = Date()
                    }
                    self.armSilenceTimer()
                }
                if let error {
                    self.lastError = error.localizedDescription
                }
            }
        }

        armSilenceTimer()
    }

    func stopListening() {
        guard isListening else { return }
        silenceTimer?.invalidate(); silenceTimer = nil
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        isListening = false
    }

    private func armSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.isListening else { return }
                let trimmed = self.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                guard Date().timeIntervalSince(self.lastTranscriptChange) >= 1.2 else {
                    self.armSilenceTimer()
                    return
                }
                self.onSilence?()
            }
        }
    }

    // MARK: - Speaking (TTS via KittenTTS)

    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        speechQueue.append(trimmed)
        isSpeaking = true
        if !isPlayingQueue {
            playNextInQueue()
        }
    }

    private func playNextInQueue() {
        guard !speechQueue.isEmpty else {
            isPlayingQueue = false
            isSpeaking = false
            pregenerated = nil
            pregeneratingText = nil
            return
        }
        isPlayingQueue = true
        let text = speechQueue.removeFirst()
        Task {
            do {
                // Use pre-generated audio if available for this text
                let samples: [Float]
                if let pre = pregenerated, pregeneratingText == text {
                    samples = pre
                    pregenerated = nil
                    pregeneratingText = nil
                } else {
                    samples = try await ttsEngine.generate(text: text, voice: "Bella")
                }

                // Pre-generate next chunk while this one plays
                if let nextText = speechQueue.first {
                    pregeneratingText = nextText
                    Task.detached { [weak self] in
                        guard let self else { return }
                        let next = try? await self.ttsEngine.generate(text: nextText, voice: "Bella")
                        await MainActor.run {
                            if self.pregeneratingText == nextText {
                                self.pregenerated = next
                            }
                        }
                    }
                }

                try await ttsEngine.playAudio(samples: samples) { [weak self] in
                    Task { @MainActor in
                        self?.playNextInQueue()
                    }
                }
            } catch {
                lastError = "TTS error: \(error.localizedDescription)"
                playNextInQueue()
            }
        }
    }

    func stopSpeaking() {
        speechQueue.removeAll()
        ttsEngine.stopAudio()
        isPlayingQueue = false
        isSpeaking = false
    }

    // Streaming: speak completed sentences as they arrive
    func speakStreamingUpdate(fullText: String) {
        guard fullText.count > spokenPrefixLength else { return }
        let remainderStart = fullText.index(fullText.startIndex, offsetBy: spokenPrefixLength)
        let remainder = fullText[remainderStart...]
        guard let lastBoundary = remainder.lastIndex(where: { ".!?,:;\n".contains($0) }) else { return }
        let chunk = String(remainder[...lastBoundary])
        let advance = fullText.distance(from: remainderStart, to: fullText.index(after: lastBoundary))
        spokenPrefixLength += advance
        let trimmed = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { speak(trimmed) }
    }

    func finalizeStreaming(fullText: String) {
        guard fullText.count > spokenPrefixLength else { return }
        let remainder = String(fullText.suffix(fullText.count - spokenPrefixLength))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        spokenPrefixLength = fullText.count
        if !remainder.isEmpty { speak(remainder) }
    }

    func resetStreamingPointer() { spokenPrefixLength = 0 }
}
