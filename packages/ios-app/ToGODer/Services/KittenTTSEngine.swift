//
//  KittenTTSEngine.swift
//  ToGODer
//
//  ONNX Runtime based Text-to-Speech engine (adapted from KittenTTS-iOS)
//

import Foundation
import AVFoundation
import Combine
import MisakiSwift

enum KittenModel: String, CaseIterable {
    case nano = "nano"

    var displayName: String {
        switch self {
        case .nano: return "Nano (15M)"
        }
    }

    var modelFileName: String {
        switch self {
        case .nano: return "kitten_tts_nano_v0_8"
        }
    }
}

@MainActor
class KittenTTSEngine: ObservableObject {

    private var session: ORTSession?
    private var env: ORTEnv?
    private var voiceEmbeddings: [String: [[Float]]] = [:]
    private var g2p: EnglishG2P?
    private var currentModel: KittenModel = .nano

    @Published var isLoaded = false
    @Published var isGenerating = false
    @Published var isLoadingModel = false
    @Published var errorMessage: String?
    @Published var loadedModelName: String = ""

    static let sampleRate: Int = 24000
    static let availableVoices = ["Bella", "Jasper", "Luna", "Bruno", "Rosie", "Hugo", "Kiki", "Leo"]

    private var audioPlayer: AVAudioPlayer?
    private var audioPlayerDelegate: AudioPlayerDelegate?

    enum KittenTTSError: Error, LocalizedError {
        case modelNotFound
        case sessionCreationFailed(String)
        case inferenceError(String)
        case voiceNotFound(String)
        case audioError(String)

        var errorDescription: String? {
            switch self {
            case .modelNotFound:
                return "ONNX model file not found in bundle"
            case .sessionCreationFailed(let msg):
                return "Failed to create ONNX session: \(msg)"
            case .inferenceError(let msg):
                return "Inference error: \(msg)"
            case .voiceNotFound(let voice):
                return "Voice '\(voice)' not found"
            case .audioError(let msg):
                return "Audio error: \(msg)"
            }
        }
    }

    init() {
        loadModel(.nano)
    }

    func loadModel(_ model: KittenModel) {
        currentModel = model
        isLoadingModel = true
        isLoaded = false
        Task.detached { [weak self] in
            do {
                guard let modelPath = Bundle.main.path(forResource: model.modelFileName, ofType: "onnx") else {
                    await MainActor.run {
                        self?.errorMessage = "ONNX model '\(model.displayName)' not found in bundle"
                        self?.isLoadingModel = false
                    }
                    return
                }

                let environment = try ORTEnv(loggingLevel: .warning)
                let sessionOptions = try ORTSessionOptions()
                try sessionOptions.setLogSeverityLevel(.warning)
                // A16 has 2 performance cores; matching threads avoids contention with E-cores.
                try sessionOptions.setIntraOpNumThreads(2)

                let xnnpackOptions = ORTXnnpackExecutionProviderOptions()
                xnnpackOptions.intra_op_num_threads = 2
                do {
                    try sessionOptions.appendXnnpackExecutionProvider(with: xnnpackOptions)
                } catch {
                    NSLog("KittenTTS: XNNPACK EP unavailable, falling back to default CPU: \(error.localizedDescription)")
                }

                let session = try ORTSession(
                    env: environment,
                    modelPath: modelPath,
                    sessionOptions: sessionOptions
                )

                let voicesFileName = "voices_\(model.rawValue)"
                var voiceEmbeddings: [String: [[Float]]] = [:]
                if let voicesURL = Bundle.main.url(forResource: voicesFileName, withExtension: "json"),
                   let data = try? Data(contentsOf: voicesURL),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: [[Double]]] {
                    for (voice, embeddings) in json {
                        voiceEmbeddings[voice] = embeddings.map { $0.map { Float($0) } }
                    }
                } else if let voicesURL = Bundle.main.url(forResource: "voices", withExtension: "json"),
                          let data = try? Data(contentsOf: voicesURL),
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: [[Double]]] {
                    for (voice, embeddings) in json {
                        voiceEmbeddings[voice] = embeddings.map { $0.map { Float($0) } }
                    }
                }

                let g2p = EnglishG2P(british: false)

                await MainActor.run {
                    self?.env = environment
                    self?.session = session
                    self?.voiceEmbeddings = voiceEmbeddings
                    self?.g2p = g2p
                    self?.isLoaded = true
                    self?.isLoadingModel = false
                    self?.loadedModelName = model.displayName
                    self?.errorMessage = nil
                }

            } catch {
                await MainActor.run {
                    self?.errorMessage = error.localizedDescription
                    self?.isLoadingModel = false
                }
            }
        }
    }

    func generate(text: String, voice: String = "Jasper", speed: Float = 1.0) async throws -> [Float] {
        guard let session = session else {
            throw KittenTTSError.modelNotFound
        }

        guard let voicePositions = voiceEmbeddings[voice] else {
            throw KittenTTSError.voiceNotFound(voice)
        }

        let refId = min(text.count, voicePositions.count - 1)
        let styleEmbedding = voicePositions[refId]

        isGenerating = true
        defer { isGenerating = false }

        let tokens = tokenize(text: text)

        let inputIdsShape: [NSNumber] = [1, NSNumber(value: tokens.count)]
        let inputIdsData = tokens.withUnsafeBufferPointer { buffer in
            Data(buffer: buffer)
        }

        let inputIdsTensor = try ORTValue(
            tensorData: NSMutableData(data: inputIdsData),
            elementType: .int64,
            shape: inputIdsShape
        )

        let styleShape: [NSNumber] = [1, 256]
        let styleData = styleEmbedding.withUnsafeBufferPointer { buffer in
            Data(buffer: buffer)
        }

        let styleTensor = try ORTValue(
            tensorData: NSMutableData(data: styleData),
            elementType: .float,
            shape: styleShape
        )

        let speedShape: [NSNumber] = [1]
        var speedValue = speed
        let speedData = Data(bytes: &speedValue, count: MemoryLayout<Float>.size)

        let speedTensor = try ORTValue(
            tensorData: NSMutableData(data: speedData),
            elementType: .float,
            shape: speedShape
        )

        let outputs = try session.run(
            withInputs: [
                "input_ids": inputIdsTensor,
                "style": styleTensor,
                "speed": speedTensor
            ],
            outputNames: ["waveform"],
            runOptions: nil
        )

        guard let waveformOutput = outputs["waveform"] else {
            throw KittenTTSError.inferenceError("No waveform output")
        }

        let waveformData = try waveformOutput.tensorData() as Data
        let sampleCount = waveformData.count / MemoryLayout<Float>.size

        var audioSamples = [Float](repeating: 0, count: sampleCount)
        waveformData.withUnsafeBytes { buffer in
            let floatBuffer = buffer.bindMemory(to: Float.self)
            for i in 0..<sampleCount {
                audioSamples[i] = floatBuffer[i]
            }
        }

        return audioSamples
    }

    private func preprocessText(_ text: String) -> String {
        var processed = text
        let acronyms: [String: String] = [
            "iOS": "eye oh ess",
            "macOS": "mac oh ess",
            "API": "A P I",
            "APIs": "A P I s",
            "URL": "U R L",
            "URLs": "U R L s",
            "HTML": "H T M L",
            "JSON": "jason",
            "SQL": "sequel",
            "GPU": "G P U",
            "CPU": "C P U",
            "AI": "A I",
            "ML": "M L",
            "LLM": "L L M",
            "TTS": "T T S",
            "STT": "S T T",
            "OK": "okay",
            "vs": "versus",
            "etc": "etcetera",
        ]
        for (acronym, expansion) in acronyms {
            processed = processed.replacingOccurrences(of: acronym, with: expansion)
        }
        return processed
    }

    private func tokenize(text: String) -> [Int64] {
        guard let g2p = g2p else {
            return simpleTokenize(text)
        }

        var processedText = preprocessText(text).trimmingCharacters(in: .whitespaces)
        if !processedText.isEmpty && !".!?,;:".contains(processedText.last!) {
            processedText += ","
        }

        let (phonemes, _) = g2p.phonemize(text: processedText)
        let tokenized = basicEnglishTokenize(phonemes)
        let tokens = phonemesToTokens(tokenized)
        return [0] + tokens + [0]
    }

    private func basicEnglishTokenize(_ text: String) -> String {
        var tokens: [String] = []
        var currentWord = ""

        for char in text {
            if char.isLetter || char.isNumber || char == "_" {
                currentWord.append(char)
            } else if !char.isWhitespace {
                if !currentWord.isEmpty {
                    tokens.append(currentWord)
                    currentWord = ""
                }
                tokens.append(String(char))
            } else {
                if !currentWord.isEmpty {
                    tokens.append(currentWord)
                    currentWord = ""
                }
            }
        }
        if !currentWord.isEmpty {
            tokens.append(currentWord)
        }

        return tokens.joined(separator: " ")
    }

    private func simpleTokenize(_ text: String) -> [Int64] {
        return [0] + text.unicodeScalars.map { Int64($0.value % 256) } + [0]
    }

    private static let kittenVocab: [Character: Int64] = {
        let pad = "$"
        let punctuation = ";:,.!?¡¿—…\"«»\"\" "
        let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        let lettersIPA = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"

        var symbols: [Character] = []
        symbols.append(contentsOf: pad)
        symbols.append(contentsOf: punctuation)
        symbols.append(contentsOf: letters)
        symbols.append(contentsOf: lettersIPA)

        var vocab: [Character: Int64] = [:]
        for (index, char) in symbols.enumerated() {
            vocab[char] = Int64(index)
        }
        return vocab
    }()

    private func phonemesToTokens(_ phonemes: String) -> [Int64] {
        var tokens: [Int64] = []
        for char in phonemes {
            if let token = Self.kittenVocab[char] {
                tokens.append(token)
            }
        }
        return tokens
    }

    // MARK: - Audio Playback

    func playAudio(samples: [Float], onFinished: (() -> Void)? = nil) async throws {
        guard !samples.isEmpty else {
            throw KittenTTSError.audioError("No audio samples to play")
        }

        let int16Samples = samples.map { sample -> Int16 in
            let clamped = max(-1.0, min(1.0, sample))
            return Int16(clamped * Float(Int16.max))
        }

        let wavData = createWAVData(samples: int16Samples)

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            throw KittenTTSError.audioError("Audio session error: \(error.localizedDescription)")
        }

        do {
            let delegate = AudioPlayerDelegate(onFinished: onFinished)
            audioPlayerDelegate = delegate
            audioPlayer = try AVAudioPlayer(data: wavData)
            audioPlayer?.delegate = delegate
            audioPlayer?.volume = 1.0
            audioPlayer?.prepareToPlay()
            audioPlayer?.play()
        } catch {
            throw KittenTTSError.audioError(error.localizedDescription)
        }
    }

    private func createWAVData(samples: [Int16]) -> Data {
        var data = Data()

        let sampleRate: UInt32 = UInt32(Self.sampleRate)
        let numChannels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let byteRate: UInt32 = sampleRate * UInt32(numChannels) * UInt32(bitsPerSample) / 8
        let blockAlign: UInt16 = numChannels * bitsPerSample / 8
        let dataSize: UInt32 = UInt32(samples.count * 2)
        let fileSize: UInt32 = 36 + dataSize

        data.append(contentsOf: "RIFF".utf8)
        data.append(contentsOf: withUnsafeBytes(of: fileSize.littleEndian) { Array($0) })
        data.append(contentsOf: "WAVE".utf8)

        data.append(contentsOf: "fmt ".utf8)
        data.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: numChannels.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: sampleRate.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })

        data.append(contentsOf: "data".utf8)
        data.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })

        for sample in samples {
            data.append(contentsOf: withUnsafeBytes(of: sample.littleEndian) { Array($0) })
        }

        return data
    }

    func stopAudio() {
        audioPlayer?.stop()
        audioPlayer = nil
        audioPlayerDelegate = nil
    }
}

// MARK: - Audio Player Delegate

private class AudioPlayerDelegate: NSObject, AVAudioPlayerDelegate {
    let onFinished: (() -> Void)?

    init(onFinished: (() -> Void)?) {
        self.onFinished = onFinished
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinished?()
    }
}
