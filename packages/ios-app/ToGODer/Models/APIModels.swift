import Foundation

// MARK: - Auth

struct SignInRequest: Codable {
    let email: String
    let password: String
}

struct SignInResponse: Codable {
    let token: String
    let userId: String
    let isAdmin: Bool?
}

struct SignUpRequest: Codable {
    let email: String
    let password: String
}

struct UpdateTokenRequest: Codable {
    let userId: String
}

struct UpdateTokenResponse: Codable {
    let token: String
}

struct ChangePasswordRequest: Codable {
    let oldPassword: String
    let newPassword: String
}

/// Body for POST /auth/resetPassword/{code}.
/// Wire-compatible with RN `ResetPasswordRequest` in model/AuthRequest.ts.
struct ResetPasswordRequest: Codable {
    let email: String
    let password: String
}

// MARK: - Chat

struct ChatRequest: Codable {
    let model: String
    let humanPrompt: Bool
    let keepGoing: Bool
    let outsideBox: Bool
    let holisticTherapist: Bool
    let communicationStyle: Int
    let prompts: [APIChatMessage]
    var configurableData: String?
    var staticData: StaticData?
    var assistantName: String?
    var memoryIndex: [String]?
    var memories: [String: String]?
    var customSystemPrompt: String?
    var persona: String?
    var libraryIntegrationEnabled: Bool?
    var memoryLoopCount: Int?
    var memoryLoopLimitReached: Bool?
    var artifactIndex: [ArtifactIndexItem]?
    var tools: [ToolSchema]?

    enum CodingKeys: String, CodingKey {
        case model, humanPrompt, keepGoing, outsideBox, holisticTherapist
        case communicationStyle, prompts, configurableData, staticData
        case assistantName = "assistant_name"
        case memoryIndex, memories, customSystemPrompt, persona
        case libraryIntegrationEnabled, memoryLoopCount, memoryLoopLimitReached
        case artifactIndex, tools
    }
}

// MARK: - Tool Schemas (OpenAI function-calling format)

/// Wire-compatible with RN `ToolSchema` in apiClients/ChatApiClient.ts.
struct ToolSchema: Codable {
    struct Function: Codable {
        let name: String
        let description: String
        let parameters: Parameters
    }
    struct Parameters: Codable {
        let type: String // "object"
        let properties: [String: Property]
        let required: [String]
    }
    struct Property: Codable {
        let type: String
        let description: String
    }
    let type: String // "function"
    let function: Function

    init(name: String, description: String, properties: [String: Property], required: [String]) {
        self.type = "function"
        self.function = Function(
            name: name,
            description: description,
            parameters: Parameters(type: "object", properties: properties, required: required)
        )
    }
}

enum ToolSchemas {
    /// Mirrors RN LIBRARY_TOOL_SCHEMA. The backend executes query_library
    /// server-side; the client only advertises it and shows activity status.
    static let library = ToolSchema(
        name: "query_library",
        description: "Search the user's personal library for relevant information. Use this to find notes, saved content, or knowledge the user has stored.",
        properties: [
            "query": .init(type: "string", description: "The search query to find relevant content in the library")
        ],
        required: ["query"]
    )

    /// Mirrors RN ARTIFACT_TOOL_SCHEMAS. These tools execute on the client.
    static let artifactTools: [ToolSchema] = [
        ToolSchema(
            name: "read_artifact",
            description: "Read the content of an artifact file or list contents of a folder. Use this to view existing artifacts.",
            properties: [
                "path": .init(type: "string", description: "The path to the artifact to read (e.g., '/src/main.ts' or '/docs')")
            ],
            required: ["path"]
        ),
        ToolSchema(
            name: "write_artifact",
            description: "Create a new artifact or update an existing artifact's content. Use this to save code, documents, or other files.",
            properties: [
                "path": .init(type: "string", description: "The path where the artifact should be saved (e.g., '/src/utils.ts')"),
                "content": .init(type: "string", description: "The content to write to the artifact"),
                "name": .init(type: "string", description: "Optional display name for the artifact. If not provided, the filename from the path will be used."),
                "mimeType": .init(type: "string", description: "Optional MIME type for the artifact (e.g., 'text/typescript', 'application/json')"),
            ],
            required: ["path", "content"]
        ),
        ToolSchema(
            name: "delete_artifact",
            description: "Delete an existing artifact. Use this to remove files or folders that are no longer needed.",
            properties: [
                "path": .init(type: "string", description: "The path to the artifact to delete (e.g., '/old-file.txt')")
            ],
            required: ["path"]
        ),
        ToolSchema(
            name: "move_artifact",
            description: "Move an artifact to a different folder. Use this to reorganize files and folders.",
            properties: [
                "path": .init(type: "string", description: "The path to the artifact to move (e.g., '/src/old-location.ts')"),
                "destination": .init(type: "string", description: "The destination folder path (e.g., '/lib' or '/' for root)"),
            ],
            required: ["path", "destination"]
        ),
        ToolSchema(
            name: "list_directory",
            description: "List the contents of a directory incrementally. Use this for navigating the artifact tree without loading everything at once. Returns immediate children of the specified path.",
            properties: [
                "path": .init(type: "string", description: "The directory path to list (e.g., '/' for root, '/src' for a subfolder)"),
                "depth": .init(type: "number", description: "How many levels deep to list (default: 1 for immediate children only, use higher values for nested listing)"),
            ],
            required: ["path"]
        ),
    ]
}

struct APIChatMessage: Codable {
    let content: String
    let role: String
    var signature: String?
    var timestamp: Double?
    var hidden: Bool?
    var toolCallId: String?
    var toolCalls: [APIToolCall]?

    enum CodingKeys: String, CodingKey {
        case content, role, signature, timestamp, hidden
        case toolCallId = "tool_call_id"
        case toolCalls = "tool_calls"
    }
}

/// OpenAI-format tool call recorded on an assistant message so the next
/// request pairs each tool_use with its tool_result (required by Anthropic).
/// Wire-compatible with RN `ApiChatMessageToolCall` in model/ChatRequest.ts.
struct APIToolCall: Codable {
    struct FunctionCall: Codable {
        let name: String
        let arguments: String
    }
    let id: String
    let type: String // always "function"
    let function: FunctionCall
}

/// Wire-compatible with the RN app's staticData in services/MessageService.ts.
struct StaticData: Codable {
    var preferredLanguage: String?
    var date: String?
    var upcomingEventsInCalendar: String?
    var pastEventsInCalendar: String?
    var health: String?
}

struct ArtifactIndexItem: Codable {
    let path: String
    let name: String
    let type: String // "file" or "folder"
    let mimeType: String?
}

// MARK: - Chat Responses

struct MessageResponse: Codable {
    let content: String
    var signature: String?
    var updateData: String?
}

struct MemoryRequestResponse: Codable {
    let requestForMemory: [String]
}

struct TitleResponse: Codable {
    let content: String
}

/// Wire-compatible with RN ExperienceApiClient.getExperience payload.
struct ExperienceRequest: Codable {
    let language: String
    var data: String?
}

struct ExperienceResponse: Codable {
    let content: String
}

struct SystemPromptRequest: Codable {
    let persona: String?
    let language: String?
    let configurableData: String?
}

struct SystemPromptResponse: Codable {
    let systemPrompt: String?
    let requestForMemory: MemoryRequest?
    let assistantName: String?

    enum CodingKeys: String, CodingKey {
        case systemPrompt
        case requestForMemory
        case assistantName = "assistant_name"
    }
}

struct ActiveSystemPromptResponse: Codable {
    let systemPrompt: String
    let assistantName: String?

    enum CodingKeys: String, CodingKey {
        case systemPrompt
        case assistantName = "assistant_name"
    }
}

struct MemoryRequest: Codable {
    let keys: [String]
}

// MARK: - Global Config

struct GlobalConfig: Codable {
    let donateOptions: [DonateOption]?
    let quote: String?
    let models: [ModelOption]?
    var prompts: [String: PromptOption]?
    let showLogin: Bool?
    let userOnboarded: Bool?
    let appFirstLaunch: Bool?
    let libraryIntegrationEnabled: Bool?
    let librarianApiUrl: String?
    let previousDefaultModel: String?
}

struct DonateOption: Codable, Identifiable {
    var id: String { name }
    let name: String
    let address: String?
    let url: String?
}

struct ModelOption: Codable, Identifiable {
    var id: String { model }
    let model: String
    let title: String
}

struct PromptOption: Codable {
    let prompt: String
    let description: String?
    let display: String?
}

// MARK: - Billing

struct BillingResponse: Codable {
    let balance: Double?
    let globalBalance: Double?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        balance = Self.decodeFlexibleDouble(from: container, key: .balance)
        globalBalance = Self.decodeFlexibleDouble(from: container, key: .globalBalance)
    }

    private static func decodeFlexibleDouble(from container: KeyedDecodingContainer<CodingKeys>, key: CodingKeys) -> Double? {
        if let value = try? container.decode(Double.self, forKey: key) {
            return value
        }
        if let str = try? container.decode(String.self, forKey: key) {
            return Double(str)
        }
        return nil
    }

    enum CodingKeys: String, CodingKey {
        case balance, globalBalance
    }
}

// MARK: - Sharing

struct ShareRequest: Codable {
    let messages: [SignedMessage]
    let title: String
    var description: String?
    let visibility: String // "PUBLIC" or "PRIVATE"
}

struct SignedMessage: Codable {
    struct MessageContent: Codable {
        let role: String
        let content: String
    }
    let message: MessageContent
    let signature: String

    var role: String { message.role }
    var content: String { message.content }
}

struct SharedChat: Codable, Identifiable {
    let id: String
    let ownerId: String
    let title: String
    var description: String?
    let createdAt: String
    let messages: String // JSON string of SignedMessage[]
    let views: Int?
    let visibility: String?
    let owner: SharedChatOwner?
}

struct SharedChatOwner: Codable {
    let id: String
    let email: String?
}

// MARK: - Artifact Sharing

struct ShareArtifactRequest: Codable {
    let title: String
    var description: String?
    let content: String
    let visibility: String
    let artifactSignature: String
}

struct ArtifactSignRequest: Codable {
    let title: String
    let content: String
}

struct ArtifactSignResponse: Codable {
    let signature: String
}

struct SharedArtifact: Codable, Identifiable {
    let id: String
    let ownerId: String
    let title: String
    var description: String?
    let content: String
    let createdAt: String
    let views: Int?
    let visibility: String?
}

// MARK: - Payload

struct PublishToPayloadRequest: Codable {
    let type: String
    let id: String
}

// MARK: - Sync

struct SyncPullResponse: Codable {
    let encryptedData: String?
    let version: Int
    let lastModified: String?
}

struct SyncRequest: Codable {
    let encryptedData: String
    let version: Int
}

// MARK: - Memory

struct MemoryFetchKeysRequest: Codable {
    let shortTermMemory: String
    let existingKeys: [String]
}

struct MemoryFetchKeysResponse: Codable {
    let keys: [String]
}

struct MemoryCompressRequest: Codable {
    let shortTermMemory: String
    let longTermMemory: [String: String]
}

struct MemoryCompressResponse: Codable {
    let shortTermMemory: String
    let longTermMemory: [String: String]
}

struct MemoryUpdateResponse: Codable {
    let updateData: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let str = try? container.decode(String.self, forKey: .updateData) {
            updateData = str
        } else if let _ = try? container.decodeNil(forKey: .updateData) {
            updateData = nil
        } else {
            updateData = nil
        }
    }

    enum CodingKeys: String, CodingKey { case updateData }
}

// MARK: - Tool Results

struct ToolResult: Codable {
    let toolCallId: String
    let result: String
}

// MARK: - Quote

struct QuoteResponse: Codable {
    let content: String?
    let quote: String?
}
