import Foundation

struct UserSettings: Codable {
    var model: String
    var humanPrompt: Bool
    var keepGoing: Bool
    var outsideBox: Bool
    var holisticTherapist: Bool
    var communicationStyle: CommunicationStyle
    var language: String
    var assistantName: String
    var libraryIntegrationEnabled: Bool
    var customSystemPrompt: String?
    var persona: String?

    static let `default` = UserSettings(
        model: "meta-llama/llama-3.2-90b-vision-instruct",
        humanPrompt: false,
        keepGoing: false,
        outsideBox: false,
        holisticTherapist: false,
        communicationStyle: .default,
        language: "English",
        assistantName: "ToGODer",
        libraryIntegrationEnabled: false
    )
}

enum CommunicationStyle: Int, Codable, CaseIterable, Identifiable {
    case `default` = 0
    case lessBloat = 1
    case adaptToConversant = 2
    case informal = 3

    var id: Int { rawValue }

    var displayName: String {
        switch self {
        case .default: return "Default"
        case .lessBloat: return "Less Bloat"
        case .adaptToConversant: return "Adapt to Conversant"
        case .informal: return "Informal"
        }
    }
}
