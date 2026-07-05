import Foundation
import Combine

@MainActor
final class ChatService: ObservableObject {
    @Published var chats: [String: Chat] = [:]
    @Published var currentChatId: String?
    @Published var isStreaming = false
    @Published var streamingContent = ""
    @Published var lastError: String?
    /// Human-readable description of the tool the AI is currently using
    /// (e.g. "Searching the library"), or nil when idle.
    @Published var toolActivity: String?

    let apiClient: APIClient
    private let storage: StorageService
    private let settingsService: SettingsService
    var calendarService: CalendarService?
    var healthService: HealthService?
    var syncService: SyncService?
    var artifactService: ArtifactService?
    var memoryService: MemoryService?
    weak var personalDataService: PersonalDataService?
    weak var authService: AuthService?
    weak var balanceService: BalanceService?
    private var pendingMemoryUpdate = false
    private var streamTask: Task<Void, Never>?

    /// Tools the AI is allowed to call, mirroring RN MessageService.buildTools.
    /// Artifact tools require a project; the library tool requires the user
    /// setting. Only authenticated users get tools at all.
    private static let frontendToolNames: Set<String> = [
        "read_artifact", "write_artifact", "delete_artifact", "move_artifact", "list_directory",
    ]

    private static let toolActivityLabels: [String: String] = [
        "query_library": "Searching the library",
        "arxiv_search": "Searching arXiv",
        "arxiv_read_paper": "Reading a paper",
        "read_artifact": "Reading a file",
        "write_artifact": "Writing an artifact",
        "delete_artifact": "Deleting an artifact",
        "move_artifact": "Moving an artifact",
        "list_directory": "Browsing files",
    ]

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

    /// Creates a local chat from existing messages (e.g. copying a shared
    /// conversation), mirroring RN's handleCopy in SharedConversationView.
    @discardableResult
    func importChat(title: String?, messages: [ChatMessage]) -> Chat {
        var chat = Chat(id: UUID().uuidString)
        chat.title = title
        chat.messages = messages
        chat.lastUpdate = Date()
        chats[chat.id] = chat
        currentChatId = chat.id
        save()
        return chat
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

    func assignChat(_ chatId: String, toProject projectId: String?) {
        guard chats[chatId] != nil else { return }
        chats[chatId]?.projectId = projectId
        chats[chatId]?.lastUpdate = Date()
        save()
    }

    // MARK: - Experiences

    func startExperience(language: String) async -> String {
        let chat = createChat()
        do {
            let response: ExperienceResponse = try await apiClient.post(
                "/experience",
                body: ExperienceRequest(language: language, data: personalDataService?.data)
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
        toolActivity = nil
    }

    // MARK: - Streaming

    /// Builds the tools array, mirroring RN MessageService.buildTools:
    /// artifact tools when the chat belongs to a project, the library tool
    /// when library integration is enabled.
    private func buildTools(projectId: String?) -> [ToolSchema]? {
        var tools: [ToolSchema] = []
        if projectId != nil {
            tools.append(contentsOf: ToolSchemas.artifactTools)
        }
        if settingsService.settings.libraryIntegrationEnabled {
            tools.append(ToolSchemas.library)
        }
        return tools.isEmpty ? nil : tools
    }

    /// Static data with the same keys as the RN app's buildStaticData so the
    /// backend prompt sees identical context on every platform.
    private func buildStaticData() -> StaticData {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE MMM dd yyyy HH:mm:ss 'GMT'ZZZ"
        let language = settingsService.settings.language
        return StaticData(
            preferredLanguage: language.isEmpty ? nil : language,
            date: formatter.string(from: Date()),
            upcomingEventsInCalendar: calendarService?.upcomingSummary,
            pastEventsInCalendar: calendarService?.pastWeekSummary,
            health: healthService?.healthSummary
        )
    }

    private func buildPrompts(for chat: Chat) -> [APIChatMessage] {
        chat.activeMessages.map { msg in
            APIChatMessage(
                content: msg.content,
                role: msg.role.rawValue,
                signature: msg.signature,
                timestamp: msg.timestamp?.timeIntervalSince1970,
                hidden: msg.hidden,
                toolCallId: msg.toolCallId,
                toolCalls: msg.toolCalls
            )
        }
    }

    private func streamResponse(for chatId: String, memoryLoopCount: Int = 0, toolCallLoopCount: Int = 0) async {
        guard let chat = chats[chatId] else { return }
        let settings = settingsService.settings

        isStreaming = true
        streamingContent = ""

        let isAuthenticated = authService?.isAuthenticated ?? false
        let hasFunds = balanceService?.hasBalance ?? false

        // Unauthenticated users are forced onto the default model (parity with RN)
        let effectiveModel = isAuthenticated
            ? settings.model
            : (settingsService.globalConfig?.models?.first?.model ?? settings.model)

        let prompts = buildPrompts(for: chat)

        let allMemories = storage.loadMemories()
        let memoryIndex = Array(allMemories.keys)

        // Memory values are gated on authentication + funds (parity with RN)
        let memoryEnabled = isAuthenticated && hasFunds
        let resolvedMemories: [String: String] = memoryEnabled
            ? storage.getMemoryValues(for: chat.memories)
            : [:]

        // Tools and the artifact index are only sent when authenticated
        let artifactIndex: [ArtifactIndexItem]? = (isAuthenticated && chat.projectId != nil)
            ? chat.projectId.flatMap { artifactService?.artifactIndex(for: $0) }
            : nil
        let tools = isAuthenticated ? buildTools(projectId: chat.projectId) : nil

        // The custom system prompt only applies when the first message starts
        // with "/custom" (parity with RN)
        let useCustomPrompt = (chat.activeMessages.first?.content.hasPrefix("/custom") ?? false)
            && settings.customSystemPrompt?.isEmpty == false

        let personalData = personalDataService?.data ?? ""
        let persona = settings.persona?.isEmpty == false ? settings.persona : nil

        let request = ChatRequest(
            model: effectiveModel,
            humanPrompt: settings.humanPrompt,
            keepGoing: settings.keepGoing,
            outsideBox: settings.outsideBox,
            holisticTherapist: settings.holisticTherapist,
            communicationStyle: settings.communicationStyle.rawValue,
            prompts: prompts,
            configurableData: personalData,
            staticData: buildStaticData(),
            assistantName: settings.assistantName,
            memoryIndex: memoryIndex,
            memories: resolvedMemories,
            customSystemPrompt: useCustomPrompt ? settings.customSystemPrompt : nil,
            persona: persona,
            libraryIntegrationEnabled: settings.libraryIntegrationEnabled,
            memoryLoopCount: memoryLoopCount,
            memoryLoopLimitReached: memoryLoopCount >= Configuration.maxMemoryLoops,
            artifactIndex: artifactIndex,
            tools: tools
        )

        streamTask = Task {
            var accumulatedContent = ""
            var signature: String?
            // Tool calls emitted this iteration; recorded on the assistant
            // message so tool_use/tool_result pairs stay valid for Anthropic.
            var assistantToolCalls: [APIToolCall] = []
            var toolCallResults: [(toolCallId: String, name: String, result: String, isError: Bool)] = []
            // Artifact operation notes (write/delete/move) are user-facing
            // summaries. They must not sit between the assistant tool_calls
            // message and the tool results, so they are appended afterwards.
            var deferredArtifactNotes: [ChatMessage] = []

            do {
                print("[ChatService] Starting stream to /chat/stream (toolLoop=\(toolCallLoopCount), memLoop=\(memoryLoopCount))")
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
                        guard memoryLoopCount < Configuration.maxMemoryLoops else { break }
                        // Append partial content if any
                        if !accumulatedContent.isEmpty {
                            appendAssistantMessage(accumulatedContent, signature: signature, to: chatId)
                        }
                        // Remember which keys this chat uses (parity with RN
                        // addMemories); they resolve at the top of the resend.
                        if var updated = chats[chatId] {
                            for key in keys where !updated.memories.contains(key) {
                                updated.memories.append(key)
                            }
                            chats[chatId] = updated
                            save()
                        }
                        isStreaming = false
                        await streamResponse(for: chatId, memoryLoopCount: memoryLoopCount + 1, toolCallLoopCount: toolCallLoopCount)
                        return

                    case .toolCall(let toolData):
                        // Every tool_call that reaches the client is ours to
                        // answer — the backend executes its own tools
                        // server-side and never forwards them. Leaving one
                        // unanswered strands the chat with a dangling
                        // tool_use, so always produce a tool result.
                        let toolCallId = toolData.id ?? UUID().uuidString
                        assistantToolCalls.append(APIToolCall(
                            id: toolCallId,
                            type: "function",
                            function: .init(name: toolData.name, arguments: toolData.argumentsJSON())
                        ))

                        let result: ArtifactService.ToolCallResult
                        if !Self.frontendToolNames.contains(toolData.name) {
                            result = ArtifactService.ToolCallResult(
                                message: "Error: tool \"\(toolData.name)\" does not exist. Answer the user directly instead.",
                                isError: true,
                                operation: .read
                            )
                        } else if let projectId = chats[chatId]?.projectId, let artifactService {
                            result = artifactService.handleToolCall(toolData, projectId: projectId)
                        } else {
                            result = ArtifactService.ToolCallResult(
                                message: "Error: tool \"\(toolData.name)\" is only available in project chats. Answer the user directly instead.",
                                isError: true,
                                operation: .read
                            )
                        }

                        print("[ChatService] Tool call \"\(toolData.name)\": \(result.isError ? "error" : "ok")")
                        toolCallResults.append((toolCallId, toolData.name, result.message, result.isError))

                        if result.operation != .read {
                            deferredArtifactNotes.append(ChatMessage(
                                content: result.isError ? "Error: \(result.message)" : result.message,
                                role: .assistant,
                                hidden: result.isError ? true : nil,
                                artifactId: result.isError ? nil : result.artifactId
                            ))
                        }

                    case .toolStatus(let status):
                        // Backend reports what the AI is doing (generating a
                        // tool call, running a backend tool)
                        toolActivity = status.status == "done"
                            ? nil
                            : (Self.toolActivityLabels[status.name] ?? "Using \(status.name)")

                    case .toolResult(let result):
                        // Backend-executed tool; nothing to do client-side
                        print("[ChatService] Backend tool result for \"\(result.name)\": \(result.isError ? "error" : "success")")

                    case .error(let msg):
                        print("[ChatService] SSE error event: \(msg)")
                        lastError = msg
                        appendAssistantMessage("Error: \(msg)", to: chatId)
                        isStreaming = false
                        toolActivity = nil
                        return

                    case .done:
                        break
                    }
                }

                // Record the assistant turn, attaching tool_calls so the next
                // request has valid tool_use/tool_result pairing.
                if !accumulatedContent.isEmpty || !assistantToolCalls.isEmpty {
                    appendAssistantMessage(
                        accumulatedContent,
                        signature: signature,
                        toolCalls: assistantToolCalls.isEmpty ? nil : assistantToolCalls,
                        to: chatId
                    )
                }

                // Send tool results back to the AI and continue the turn
                if !toolCallResults.isEmpty && toolCallLoopCount < Configuration.maxToolCallLoops {
                    for result in toolCallResults {
                        let toolMessage = ChatMessage(
                            content: result.isError ? "Error: \(result.result)" : result.result,
                            role: .tool,
                            hidden: true,
                            toolCallId: result.toolCallId
                        )
                        chats[chatId]?.messages.append(toolMessage)
                    }
                    for note in deferredArtifactNotes {
                        chats[chatId]?.messages.append(note)
                    }
                    chats[chatId]?.lastUpdate = Date()
                    save()

                    print("[ChatService] Tool loop \(toolCallLoopCount + 1): sending \(toolCallResults.count) results back to AI")
                    isStreaming = false
                    streamingContent = ""
                    await streamResponse(for: chatId, memoryLoopCount: memoryLoopCount, toolCallLoopCount: toolCallLoopCount + 1)
                    return
                }

                // Generate title if needed
                if chats[chatId]?.title == nil && !accumulatedContent.isEmpty {
                    await generateTitle(for: chatId)
                }

                // Fire-and-forget short-term memory update
                triggerMemoryUpdate(for: chatId)

                // Refresh balance after a completed turn (parity with RN)
                if isAuthenticated {
                    await balanceService?.fetchBalance()
                }
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
            toolActivity = nil
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
        let prompts = buildPrompts(for: chat)
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
            staticData: buildStaticData(),
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

    private func appendAssistantMessage(_ content: String, signature: String? = nil, toolCalls: [APIToolCall]? = nil, to chatId: String) {
        let message = ChatMessage(content: content, role: .assistant, signature: signature, toolCalls: toolCalls)
        chats[chatId]?.messages.append(message)
        chats[chatId]?.lastUpdate = Date()
        save()
    }

    // MARK: - System Prompt Generation

    /// Generates a personalized system prompt via /generate-system-prompt,
    /// resolving requested memories in a loop. Port of RN useSystemPrompt.
    func generateSystemPrompt() async throws -> String {
        let settings = settingsService.settings
        let allMemories = storage.loadMemories()
        let memoryIndex = Array(allMemories.keys)
        var memories: [String: String] = [:]
        var loopCount = 0
        var limitReached = false

        while true {
            let request = ChatRequest(
                model: settings.model,
                humanPrompt: settings.humanPrompt,
                keepGoing: settings.keepGoing,
                outsideBox: settings.outsideBox,
                holisticTherapist: settings.holisticTherapist,
                communicationStyle: settings.communicationStyle.rawValue,
                prompts: [],
                configurableData: personalDataService?.data ?? "",
                staticData: buildStaticData(),
                assistantName: settings.assistantName,
                memoryIndex: memoryIndex,
                memories: memories,
                memoryLoopCount: loopCount,
                memoryLoopLimitReached: limitReached
            )

            let response: SystemPromptResponse = try await apiClient.post("/generate-system-prompt", body: request)

            let requestedKeys = response.requestForMemory?.keys ?? []
            if requestedKeys.isEmpty || limitReached {
                guard let prompt = response.systemPrompt, !prompt.isEmpty else {
                    throw APIError.invalidResponse
                }
                return prompt
            }

            memories.merge(storage.getMemoryValues(for: requestedKeys)) { _, new in new }
            loopCount += 1
            if loopCount >= Configuration.maxMemoryLoops {
                limitReached = true
            }
        }
    }

    // MARK: - Title Generation

    private func generateTitle(for chatId: String) async {
        guard let chat = chats[chatId] else { return }
        let prompts = chat.activeMessages.prefix(4).map { msg in
            APIChatMessage(content: msg.content, role: msg.role.rawValue)
        }

        do {
            let response: TitleResponse = try await apiClient.post("/title", body: ["content": prompts])
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
