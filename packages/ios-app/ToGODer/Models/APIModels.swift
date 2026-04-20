import Foundation

// MARK: - Auth

struct SignInRequest: Codable {
    let email: String
    let password: String
}

struct SignInResponse: Codable {
    let token: String
    let userId: String
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

struct ResetPasswordRequest: Codable {
    let code: String
    let newPassword: String
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

    enum CodingKeys: String, CodingKey {
        case model, humanPrompt, keepGoing, outsideBox, holisticTherapist
        case communicationStyle, prompts, configurableData, staticData
        case assistantName = "assistant_name"
        case memoryIndex, memories, customSystemPrompt, persona
        case libraryIntegrationEnabled, memoryLoopCount, memoryLoopLimitReached
        case artifactIndex
    }
}

struct APIChatMessage: Codable {
    let content: String
    let role: String
    var signature: String?
    var timestamp: Double?
    var hidden: Bool?
}

struct StaticData: Codable {
    var date: String?
    var calendarEvents: String?
    var health: String?
}

struct ArtifactIndexItem: Codable {
    let path: String
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

struct ExperienceRequest: Codable {
    let language: String
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
