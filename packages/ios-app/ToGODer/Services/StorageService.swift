import Foundation

final class StorageService {
    private let defaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private enum Keys {
        static let hasLaunched = "hasLaunched"
        static let isOnboarded = "isOnboarded"
        static let authToken = "authToken"
        static let userId = "userId"
        static let userEmail = "userEmail"
        static let chats = "chats"
        static let userSettings = "userSettings"
        static let memories = "memories"
        static let syncVersion = "syncVersion"
        static let language = "language"
        static let passcode = "passcode"
    }

    // MARK: - App State

    var hasLaunched: Bool {
        get { defaults.bool(forKey: Keys.hasLaunched) }
        set { defaults.set(newValue, forKey: Keys.hasLaunched) }
    }

    var isOnboarded: Bool {
        get { defaults.bool(forKey: Keys.isOnboarded) }
        set { defaults.set(newValue, forKey: Keys.isOnboarded) }
    }

    // MARK: - Auth

    var authToken: String? {
        get { defaults.string(forKey: Keys.authToken) }
        set { defaults.set(newValue, forKey: Keys.authToken) }
    }

    var userId: String? {
        get { defaults.string(forKey: Keys.userId) }
        set { defaults.set(newValue, forKey: Keys.userId) }
    }

    var userEmail: String? {
        get { defaults.string(forKey: Keys.userEmail) }
        set { defaults.set(newValue, forKey: Keys.userEmail) }
    }

    // MARK: - Language

    var language: String? {
        get { defaults.string(forKey: Keys.language) }
        set { defaults.set(newValue, forKey: Keys.language) }
    }

    // MARK: - Passcode

    var passcode: String? {
        get { defaults.string(forKey: Keys.passcode) }
        set { defaults.set(newValue, forKey: Keys.passcode) }
    }

    // MARK: - Chats

    func saveChats(_ chats: [String: Chat]) {
        if let data = try? encoder.encode(chats) {
            defaults.set(data, forKey: Keys.chats)
        }
    }

    func loadChats() -> [String: Chat] {
        guard let data = defaults.data(forKey: Keys.chats),
              let chats = try? decoder.decode([String: Chat].self, from: data) else {
            return [:]
        }
        return chats
    }

    // MARK: - Settings

    func saveSettings(_ settings: UserSettings) {
        if let data = try? encoder.encode(settings) {
            defaults.set(data, forKey: Keys.userSettings)
        }
    }

    func loadSettings() -> UserSettings {
        guard let data = defaults.data(forKey: Keys.userSettings),
              let settings = try? decoder.decode(UserSettings.self, from: data) else {
            return .default
        }
        return settings
    }

    // MARK: - Memories

    func saveMemories(_ memories: [String: String]) {
        if let data = try? encoder.encode(memories) {
            defaults.set(data, forKey: Keys.memories)
        }
    }

    func loadMemories() -> [String: String] {
        guard let data = defaults.data(forKey: Keys.memories),
              let memories = try? decoder.decode([String: String].self, from: data) else {
            return [:]
        }
        return memories
    }

    func getMemoryValues(for keys: [String]) -> [String: String] {
        let all = loadMemories()
        return keys.reduce(into: [:]) { result, key in
            if let value = all[key] {
                result[key] = value
            }
        }
    }

    // MARK: - Sync

    var syncVersion: Int {
        get { defaults.integer(forKey: Keys.syncVersion) }
        set { defaults.set(newValue, forKey: Keys.syncVersion) }
    }

    // MARK: - Clear

    func clearAll() {
        let domain = Bundle.main.bundleIdentifier!
        defaults.removePersistentDomain(forName: domain)
    }
}
