import Foundation
import Combine

@MainActor
final class ChatService: ObservableObject {
    @Published var chats: [String: Chat] = [:]
    @Published var currentChatId: String?
    @Published var isStreaming = false
    @Published var streamingContent = ""

    let apiClient: APIClient
    private let storage: StorageService
    private let settingsService: SettingsService
    private var streamTask: Task<Void, Never>?

    init(apiClient: APIClient, storage: StorageService, settingsService: SettingsService) {
        self.apiClient = apiClient
        self.storage = storage
        self.settingsService = settingsService
        self.chats = storage.loadChats()
    }

    var currentChat: Chat? {
        guard let id = currentChatId else { return nil }
        return chats[id]
    }

    var sortedChats: [Chat] {
        chats.values
            .filter { $0.deleted != true }
            .sorted { ($0.lastUpdate ?? .distantPast) > ($1.lastUpdate ?? .distantPast) }
    }

    // MARK: - Chat Management

    func createChat(isRequest: Bool = false, projectId: String? = nil) -> Chat {
        let chat = Chat(id: UUID().uuidString, isRequest: isRequest, projectId: projectId)
        chats[chat.id] = chat
        currentChatId = chat.id
        save()
        return chat
    }

    func selectChat(_ id: String) {
        currentChatId = id
    }

    func deleteChat(_ id: String) {
        chats[id]?.deleted = true
        chats[id]?.deletedAt = Date()
        if currentChatId == id {
            currentChatId = sortedChats.first?.id
        }
        save()
    }

    func updateDraft(_ text: String, chatId: String) {
        chats[chatId]?.draftInputText = text
    }

    // MARK: - Experiences

    func startExperience(language: String) async -> String {
        let chat = createChat()
        do {
            let response: ExperienceResponse = try await apiClient.post(
                "/experience",
                body: ExperienceRequest(language: language)
            )
            appendAssistantMessage(response.content, to: chat.id)
        } catch {
            // Chat is still created even if experience fetch fails
        }
        return chat.id
    }

    // MARK: - Message Sending

    func sendMessage(_ content: String, in chatId: String) async {
        guard var chat = chats[chatId] else { return }

        let userMessage = ChatMessage(content: content, role: .user)
        chat.messages.append(userMessage)
        chat.lastUpdate = Date()
        chats[chatId] = chat
        save()

        await streamResponse(for: chatId)
    }

    func regenerateLastResponse(in chatId: String) async {
        guard var chat = chats[chatId] else { return }

        // Remove last assistant message
        if let lastIndex = chat.messages.lastIndex(where: { $0.role == .assistant }) {
            chat.messages[lastIndex].deleted = true
            chat.messages[lastIndex].deletedAt = Date()
            chats[chatId] = chat
            save()
        }

        await streamResponse(for: chatId)
    }

    func editMessage(_ messageId: String, newContent: String, in chatId: String) async {
        guard var chat = chats[chatId],
              let index = chat.messages.firstIndex(where: { $0.id == messageId }) else { return }

        // Mark this and all subsequent messages as deleted
        for i in index..<chat.messages.count {
            chat.messages[i].deleted = true
            chat.messages[i].deletedAt = Date()
        }

        // Add the edited message
        let edited = ChatMessage(content: newContent, role: .user)
        chat.messages.append(edited)
        chat.lastUpdate = Date()
        chats[chatId] = chat
        save()

        await streamResponse(for: chatId)
    }

    func deleteMessage(_ messageId: String, in chatId: String) {
        guard var chat = chats[chatId],
              let index = chat.messages.firstIndex(where: { $0.id == messageId }) else { return }
        chat.messages[index].deleted = true
        chat.messages[index].deletedAt = Date()
        chats[chatId] = chat
        save()
    }

    func retryLastMessage(in chatId: String) async {
        guard var chat = chats[chatId] else { return }

        // Remove the failed assistant message
        if let lastIndex = chat.messages.lastIndex(where: { $0.role == .assistant && $0.deleted != true }) {
            chat.messages[lastIndex].deleted = true
            chat.messages[lastIndex].deletedAt = Date()
            chats[chatId] = chat
            save()
        }

        await streamResponse(for: chatId)
    }

    func cancelStreaming() {
        streamTask?.cancel()
        streamTask = nil
        isStreaming = false
        streamingContent = ""
    }

    // MARK: - Streaming

    private func streamResponse(for chatId: String, memoryLoopCount: Int = 0) async {
        guard let chat = chats[chatId] else { return }
        let settings = settingsService.settings

        isStreaming = true
        streamingContent = ""

        let prompts = chat.activeMessages.map { msg in
            APIChatMessage(
                content: msg.content,
                role: msg.role.rawValue,
                signature: msg.signature,
                timestamp: msg.timestamp?.timeIntervalSince1970,
                hidden: msg.hidden
            )
        }

        let memories = storage.loadMemories()
        let memoryIndex = Array(memories.keys)

        let request = ChatRequest(
            model: settings.model,
            humanPrompt: settings.humanPrompt,
            keepGoing: settings.keepGoing,
            outsideBox: settings.outsideBox,
            holisticTherapist: settings.holisticTherapist,
            communicationStyle: settings.communicationStyle.rawValue,
            prompts: prompts,
            configurableData: settings.persona,
            staticData: StaticData(date: ISO8601DateFormatter().string(from: Date())),
            assistantName: settings.assistantName,
            memoryIndex: memoryIndex,
            customSystemPrompt: settings.customSystemPrompt,
            persona: settings.persona,
            libraryIntegrationEnabled: settings.libraryIntegrationEnabled,
            memoryLoopCount: memoryLoopCount,
            memoryLoopLimitReached: memoryLoopCount >= Configuration.maxMemoryLoops
        )

        streamTask = Task {
            var accumulatedContent = ""
            var signature: String?

            do {
                let stream = await apiClient.stream("/chat/stream", body: request)
                for try await event in stream {
                    guard !Task.isCancelled else { return }

                    switch event {
                    case .chunk(let text):
                        accumulatedContent += text
                        streamingContent = accumulatedContent

                    case .signature(let sig):
                        signature = sig

                    case .memoryRequest(let keys):
                        // Fetch requested memories and resend
                        guard memoryLoopCount < Configuration.maxMemoryLoops else { break }
                        _ = storage.getMemoryValues(for: keys)
                        // Append partial content if any
                        if !accumulatedContent.isEmpty {
                            appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                        }
                        isStreaming = false
                        // Re-send with memories
                        await streamResponse(for: chatId, memoryLoopCount: memoryLoopCount + 1)
                        return

                    case .toolCall:
                        // TODO: Handle artifact tool calls
                        break

                    case .error(let msg):
                        appendAssistantMessage("Error: \(msg)", to: chatId)
                        isStreaming = false
                        return

                    case .done:
                        break
                    }
                }

                if !accumulatedContent.isEmpty {
                    appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                }

                // Generate title if needed
                if chats[chatId]?.title == nil && !accumulatedContent.isEmpty {
                    await generateTitle(for: chatId)
                }
            } catch {
                if !Task.isCancelled {
                    if !accumulatedContent.isEmpty {
                        appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                    } else {
                        appendAssistantMessage("Failed to get response. Please try again.", to: chatId)
                    }
                }
            }

            isStreaming = false
            streamingContent = ""
        }
    }

    private func appendAssistantMessage(_ content: String, signature: String? = nil, to chatId: String) {
        let message = ChatMessage(content: content, role: .assistant, signature: signature)
        chats[chatId]?.messages.append(message)
        chats[chatId]?.lastUpdate = Date()
        save()
    }

    // MARK: - Title Generation

    private func generateTitle(for chatId: String) async {
        guard let chat = chats[chatId] else { return }
        let prompts = chat.activeMessages.prefix(4).map { msg in
            APIChatMessage(content: msg.content, role: msg.role.rawValue)
        }

        do {
            let response: TitleResponse = try await apiClient.post("/title", body: ["prompts": prompts])
            chats[chatId]?.title = response.content
            save()
        } catch {
            // Title generation is non-critical
        }
    }

    // MARK: - Persistence

    private func save() {
        storage.saveChats(chats)
    }
}
