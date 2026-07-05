import SwiftUI

struct VoiceChatView: View {
    let chatId: String

    @EnvironmentObject var chatService: ChatService
    @Environment(\.dismiss) private var dismiss
    @StateObject private var voice = VoiceChatService()

    @State private var phase: Phase = .idle
    @State private var errorText: String?
    @State private var latestResponse: String = ""

    enum Phase { case idle, listening, thinking, speaking, denied }

    var body: some View {
        VStack(spacing: 20) {
            header
            Spacer()
            orb
            Text(statusText)
                .font(.headline)
                .foregroundStyle(.secondary)

            ScrollView {
                VStack(spacing: 12) {
                    if !voice.transcript.isEmpty {
                        Text(voice.transcript)
                            .font(.title3)
                            .multilineTextAlignment(.center)
                    }
                    if (chatService.isStreaming || phase == .speaking || phase == .thinking), !latestResponse.isEmpty {
                        Text(latestResponse)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    if let errorText {
                        Text(errorText)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(.horizontal)
            }
            .frame(maxHeight: 240)

            Spacer()
            controlButton
                .padding(.bottom, 40)
        }
        .task { await requestAndStart() }
        .onDisappear { tearDown() }
        .onChange(of: chatService.streamingContent) { _, newValue in
            guard phase == .thinking || phase == .speaking else { return }
            if !newValue.isEmpty { latestResponse = newValue }
            if phase == .thinking, !newValue.isEmpty { phase = .speaking }
            voice.speakStreamingUpdate(fullText: newValue)
        }
        .onChange(of: chatService.isStreaming) { _, streaming in
            if !streaming, phase == .thinking || phase == .speaking {
                voice.finalizeStreaming(fullText: latestResponse)
            }
        }
        .onChange(of: voice.isSpeaking) { _, speaking in
            if !speaking, phase == .speaking, !chatService.isStreaming {
                phase = .idle
                startListening()
            }
        }
    }

    // MARK: - Subviews

    private var header: some View {
        HStack {
            Button("Done") { dismiss() }
            Spacer()
            Text("Voice Chat").font(.headline)
            Spacer()
            Color.clear.frame(width: 44, height: 1)
        }
        .padding()
    }

    private var orb: some View {
        let color: Color = {
            switch phase {
            case .listening: return .blue
            case .thinking: return .orange
            case .speaking: return .green
            case .denied: return .red
            case .idle: return .gray
            }
        }()
        return Circle()
            .fill(color.opacity(0.25))
            .frame(width: 180, height: 180)
            .overlay(Circle().stroke(color, lineWidth: 3))
            .scaleEffect(phase == .idle || phase == .denied ? 1.0 : 1.08)
            .animation(
                phase == .idle || phase == .denied
                    ? .default
                    : .easeInOut(duration: 0.9).repeatForever(autoreverses: true),
                value: phase
            )
    }

    private var statusText: String {
        switch phase {
        case .idle: return voice.ttsEngine.isLoaded ? "Tap mic to start" : "Loading TTS model..."
        case .listening: return "Listening..."
        case .thinking: return "Thinking..."
        case .speaking: return "Speaking..."
        case .denied: return "Microphone or speech access denied. Enable in Settings."
        }
    }

    private var controlButton: some View {
        Button(action: toggle) {
            Image(systemName: iconName)
                .font(.system(size: 72))
                .foregroundStyle(iconColor)
        }
        .disabled(phase == .thinking || phase == .denied || !voice.ttsEngine.isLoaded)
    }

    private var iconName: String {
        switch phase {
        case .listening: return "stop.circle.fill"
        case .speaking: return "speaker.wave.2.circle.fill"
        case .thinking: return "hourglass.circle.fill"
        default: return "mic.circle.fill"
        }
    }

    private var iconColor: Color {
        switch phase {
        case .listening: return .red
        case .speaking: return .green
        case .thinking: return .orange
        case .denied: return .gray
        default: return .blue
        }
    }

    // MARK: - Logic

    private func requestAndStart() async {
        let ok = await voice.requestPermissions()
        guard ok else { phase = .denied; return }
        startListening()
    }

    private func startListening() {
        do {
            try voice.startListening(onSilenceDetected: handleSilence)
            phase = .listening
            errorText = nil
        } catch {
            errorText = "Could not start microphone: \(error.localizedDescription)"
            phase = .idle
        }
    }

    private func toggle() {
        switch phase {
        case .idle:
            startListening()
        case .listening:
            handleSilence()
        case .speaking:
            voice.stopSpeaking()
            phase = .idle
            startListening()
        default:
            break
        }
    }

    private func handleSilence() {
        let text = voice.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        voice.stopListening()
        guard !text.isEmpty else { phase = .idle; return }
        phase = .thinking
        latestResponse = ""
        voice.resetStreamingPointer()
        Task { await chatService.sendMessage(text, in: chatId) }
    }

    private func tearDown() {
        voice.stopListening()
        voice.stopSpeaking()
    }
}
