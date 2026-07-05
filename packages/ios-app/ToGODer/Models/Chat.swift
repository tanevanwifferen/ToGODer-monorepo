import Foundation

struct Chat: Identifiable, Codable {
    let id: String
    var title: String?
    var messages: [ChatMessage]
    var isRequest: Bool
    var lastUpdate: Date?
    var memories: [String]
    var draftInputText: String?
    var projectId: String?
    var deleted: Bool?
    var deletedAt: Date?

    init(
        id: String = UUID().uuidString,
        title: String? = nil,
        messages: [ChatMessage] = [],
        isRequest: Bool = false,
        lastUpdate: Date? = Date(),
        memories: [String] = [],
        draftInputText: String? = nil,
        projectId: String? = nil
    ) {
        self.id = id
        self.title = title
        self.messages = messages
        self.isRequest = isRequest
        self.lastUpdate = lastUpdate
        self.memories = memories
        self.draftInputText = draftInputText
        self.projectId = projectId
    }

    var activeMessages: [ChatMessage] {
        messages.filter { $0.deleted != true }
    }

    var displayTitle: String {
        title ?? "New Conversation"
    }
}

struct ChatMessage: Identifiable, Codable {
    let id: String
    var content: String
    var role: MessageRole
    var signature: String?
    var timestamp: Date?
    var updateData: String?
    var hidden: Bool?
    var artifactId: String?
    var toolCallId: String?
    var toolCalls: [APIToolCall]?
    var deleted: Bool?
    var deletedAt: Date?

    init(
        id: String = UUID().uuidString,
        content: String,
        role: MessageRole,
        signature: String? = nil,
        timestamp: Date? = Date(),
        hidden: Bool? = nil,
        artifactId: String? = nil,
        toolCallId: String? = nil,
        toolCalls: [APIToolCall]? = nil
    ) {
        self.id = id
        self.content = content
        self.role = role
        self.signature = signature
        self.timestamp = timestamp
        self.hidden = hidden
        self.artifactId = artifactId
        self.toolCallId = toolCallId
        self.toolCalls = toolCalls
    }

    var isUser: Bool { role == .user }
    var isAssistant: Bool { role == .assistant }
}

enum MessageRole: String, Codable {
    case user
    case assistant
    case tool
}
