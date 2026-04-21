import Foundation
import Combine

@MainActor
final class ChatService: ObservableObject {
    @Published var chats: [String: Chat] = [:]
    @Published var currentChatId: String?
    @Published var isStreaming = false
    @Published var streamingContent = ""
    @Published var lastError: String?

    let apiClient: APIClient
    private let storage: StorageService
    private let settingsService: SettingsService
    var calendarService: CalendarService?
    var healthService: HealthService?
    var syncService: SyncService?
    var artifactService: ArtifactService?
    var memoryService: MemoryService?
    weak var personalDataService: PersonalDataService?
    private var pendingMemoryUpdate = false
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

    private func streamResponse(for chatId: String, memoryLoopCount: Int = 0, requestedMemoryKeys: [String]? = nil) async {
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

        let allMemories = storage.loadMemories()
        let memoryIndex = Array(allMemories.keys)

        // Include fetched memory values if this is a memory loop iteration
        let requestedMemories: [String: String]? = requestedMemoryKeys.map { keys in
            storage.getMemoryValues(for: keys)
        }

        let personalData = personalDataService?.data ?? ""
        let configurableData = personalData.isEmpty ? settings.persona : personalData

        let request = ChatRequest(
            model: settings.model,
            humanPrompt: settings.humanPrompt,
            keepGoing: settings.keepGoing,
            outsideBox: settings.outsideBox,
            holisticTherapist: settings.holisticTherapist,
            communicationStyle: settings.communicationStyle.rawValue,
            prompts: prompts,
            configurableData: configurableData,
            staticData: StaticData(
                date: ISO8601DateFormatter().string(from: Date()),
                calendarEvents: calendarService?.calendarSummary,
                health: healthService?.healthSummary
            ),
            assistantName: settings.assistantName,
            memoryIndex: memoryIndex,
            memories: requestedMemories,
            customSystemPrompt: settings.customSystemPrompt,
            persona: settings.persona,
            libraryIntegrationEnabled: settings.libraryIntegrationEnabled,
            memoryLoopCount: memoryLoopCount,
            memoryLoopLimitReached: memoryLoopCount >= Configuration.maxMemoryLoops,
            artifactIndex: chat.projectId.flatMap { artifactService?.artifactIndex(for: $0) }
        )

        streamTask = Task {
            var accumulatedContent = ""
            var signature: String?

            do {
                print("[ChatService] Starting stream to /chat/stream")
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
                        // Fetch requested memories and resend with values
                        guard memoryLoopCount < Configuration.maxMemoryLoops else { break }
                        // Append partial content if any
                        if !accumulatedContent.isEmpty {
                            appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                        }
                        isStreaming = false
                        // Re-send with the requested memory values included
                        await streamResponse(for: chatId, memoryLoopCount: memoryLoopCount + 1, requestedMemoryKeys: keys)
                        return

                    case .toolCall(let toolData):
                        if toolData.name == "query_library" {
                            let query = toolData.arguments?["query"] ?? ""
                            accumulatedContent += "\n\n*Searching library for: \"\(query)\"...*\n\n"
                            streamingContent = accumulatedContent

                            // Execute library query client-side if we have the API URL
                            if let librarianUrl = self.settingsService.globalConfig?.librarianApiUrl,
                               let url = URL(string: librarianUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/chat") {
                                do {
                                    let result = try await self.queryLibrary(url: url, query: query)
                                    accumulatedContent += result + "\n\n"
                                    streamingContent = accumulatedContent
                                } catch {
                                    accumulatedContent += "*Library search failed: \(error.localizedDescription)*\n\n"
                                    streamingContent = accumulatedContent
                                }
                            }
                        }
                        if toolData.name == "write_artifact",
                           let path = toolData.arguments?["path"],
                           let fileContent = toolData.arguments?["content"],
                           let projectId = chat.projectId {
                            accumulatedContent += "\n\n*Writing artifact: \(path)...*\n\n"
                            streamingContent = accumulatedContent
                            self.artifactService?.writeArtifact(path: path, content: fileContent, projectId: projectId)
                        }

                    case .error(let msg):
                        print("[ChatService] SSE error event: \(msg)")
                        lastError = msg
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

                // Fire-and-forget short-term memory update
                triggerMemoryUpdate(for: chatId)
            } catch {
                if !Task.isCancelled {
                    let errorMessage = error.localizedDescription
                    print("[ChatService] Stream error: \(errorMessage)")
                    lastError = errorMessage
                    if !accumulatedContent.isEmpty {
                        appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                    } else {
                        appendAssistantMessage("Error: \(errorMessage)", to: chatId)
                    }
                }
            }

            isStreaming = false
            streamingContent = ""
        }
    }

    // MARK: - Memory Update

    /// Asks the backend to derive an updated short-term memory from the latest
    /// conversation. Runs asynchronously so it never blocks the UI.
    private func triggerMemoryUpdate(for chatId: String) {
        guard !pendingMemoryUpdate else { return }
        guard let chat = chats[chatId] else { return }
        guard let personalDataService else { return }
        pendingMemoryUpdate = true

        let settings = settingsService.settings
        let prompts = chat.activeMessages.map { msg in
            APIChatMessage(
                content: msg.content,
                role: msg.role.rawValue,
                signature: msg.signature,
                timestamp: msg.timestamp?.timeIntervalSince1970,
                hidden: msg.hidden
            )
        }
        let currentMemories = storage.loadMemories()
        let memoryIndex = Array(currentMemories.keys)

        let request = ChatRequest(
            model: settings.model,
            humanPrompt: settings.humanPrompt,
            keepGoing: settings.keepGoing,
            outsideBox: settings.outsideBox,
            holisticTherapist: settings.holisticTherapist,
            communicationStyle: settings.communicationStyle.rawValue,
            prompts: prompts,
            configurableData: personalDataService.data,
            staticData: StaticData(
                date: ISO8601DateFormatter().string(from: Date()),
                calendarEvents: calendarService?.calendarSummary,
                health: healthService?.healthSummary
            ),
            assistantName: settings.assistantName,
            memoryIndex: memoryIndex,
            memories: currentMemories,
            customSystemPrompt: settings.customSystemPrompt,
            persona: settings.persona
        )

        Task {
            defer { self.pendingMemoryUpdate = false }
            do {
                let response: MemoryUpdateResponse = try await apiClient.post(
                    "/chat/memory-update",
                    body: request
                )
                if let data = response.updateData {
                    personalDataService.set(data)
                }
            } catch {
                // Memory update is best-effort
            }
        }
    }

    private func appendAssistantMessage(_ content: String, signature: String? = nil, to chatId: String) {
        let message = ChatMessage(content: content, role: .assistant, signature: signature)
        chats[chatId]?.messages.append(message)
        chats[chatId]?.lastUpdate = Date()
        save()
    }

    // MARK: - Library Query

    private func queryLibrary(url: URL, query: String) async throws -> String {
        struct LibraryRequest: Codable {
            let messages: [APIChatMessage]
        }
        struct LibraryResponse: Codable {
            let answer: String?
            let sources: [LibrarySource]?
        }
        struct LibrarySource: Codable {
            let filename: String?
            let chunk_index: Int?
        }

        let requestBody = LibraryRequest(messages: [APIChatMessage(content: query, role: "user")])
        let response: LibraryResponse = try await apiClient.post(url: url, body: requestBody)

        guard let answer = response.answer, !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "No relevant excerpts found for this query."
        }

        var result = answer.trimmingCharacters(in: .whitespacesAndNewlines)

        if let sources = response.sources, !sources.isEmpty {
            let formattedSources = sources.map { src in
                let filename = src.filename ?? "unknown"
                if let chunkIndex = src.chunk_index {
                    return "- \(filename)#\(chunkIndex)"
                }
                return "- \(filename)"
            }.joined(separator: "\n")
            if !formattedSources.isEmpty {
                result += "\n\nSources:\n" + formattedSources
            }
        }

        return result
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
        syncService?.schedulePush()
    }
}
