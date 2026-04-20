import SwiftUI

struct ChatView: View {
    let chatId: String

    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var settingsService: SettingsService
    @State private var inputText = ""
    @State private var editingMessageId: String?
    @State private var editText = ""
    @FocusState private var isInputFocused: Bool

    private var chat: Chat? {
        chatService.chats[chatId]
    }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            if chatService.isStreaming {
                streamingIndicator
            }
            inputBar
        }
        .navigationTitle(chat?.displayTitle ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            inputText = chat?.draftInputText ?? ""
        }
        .onChange(of: inputText) { _, newValue in
            chatService.updateDraft(newValue, chatId: chatId)
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if let messages = chat?.activeMessages {
                        ForEach(messages) { message in
                            MessageBubble(
                                message: message,
                                onEdit: {
                                    editingMessageId = message.id
                                    editText = message.content
                                },
                                onDelete: {
                                    chatService.deleteMessage(message.id, in: chatId)
                                },
                                onRegenerate: message.isAssistant ? {
                                    Task { await chatService.regenerateLastResponse(in: chatId) }
                                } : nil
                            )
                            .id(message.id)
                        }
                    }

                    if chatService.isStreaming && !chatService.streamingContent.isEmpty {
                        MessageBubble(
                            message: ChatMessage(
                                id: "streaming",
                                content: chatService.streamingContent,
                                role: .assistant
                            ),
                            onEdit: nil,
                            onDelete: nil
                        )
                        .id("streaming")
                    }
                }
                .padding()
            }
            .onChange(of: chat?.messages.count) { _, _ in
                withAnimation {
                    proxy.scrollTo(chat?.activeMessages.last?.id, anchor: .bottom)
                }
            }
            .onChange(of: chatService.streamingContent) { _, _ in
                proxy.scrollTo("streaming", anchor: .bottom)
            }
        }
    }

    // MARK: - Streaming Indicator

    private var streamingIndicator: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text("Thinking...")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Stop") {
                chatService.cancelStreaming()
            }
            .font(.caption)
            .foregroundStyle(.red)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 0) {
            Divider()

            if let editId = editingMessageId {
                editBar(messageId: editId)
            } else {
                normalInputBar
            }
        }
    }

    private var normalInputBar: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .focused($isInputFocused)
                .onSubmit { sendMessage() }

            Button {
                sendMessage()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(canSend ? .blue : .gray)
            }
            .disabled(!canSend)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.background)
    }

    private func editBar(messageId: String) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text("Editing message")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Cancel") {
                    editingMessageId = nil
                    editText = ""
                }
                .font(.caption)
            }

            HStack(alignment: .bottom, spacing: 12) {
                TextField("Edit message...", text: $editText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)

                Button {
                    Task {
                        await chatService.editMessage(messageId, newContent: editText, in: chatId)
                        editingMessageId = nil
                        editText = ""
                    }
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.blue)
                }
                .disabled(editText.isEmpty)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(Color.yellow.opacity(0.1))
    }

    // MARK: - Actions

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chatService.isStreaming
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        Task {
            await chatService.sendMessage(text, in: chatId)
        }
    }
}
