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
        static let memories = "memories" // legacy [String: String]
        static let memoriesVersioned = "memories_v2" // [String: SyncableMemory]
        static let memoriesMigratedAt = "memoriesMigratedAt"
        static let personalData = "personalData"
        static let syncVersion = "syncVersion"
        static let language = "language"
        static let passcode = "passcode"
        static let projects = "projects"
        static let artifacts = "artifacts"
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

    // MARK: - Projects

    func saveProjects(_ projects: [String: Project]) {
        if let data = try? encoder.encode(projects) {
            defaults.set(data, forKey: Keys.projects)
        }
    }

    func loadProjects() -> [String: Project] {
        guard let data = defaults.data(forKey: Keys.projects),
              let projects = try? decoder.decode([String: Project].self, from: data) else {
            return [:]
        }
        return projects
    }

    // MARK: - Artifacts

    func saveArtifacts(_ artifacts: [String: Artifact]) {
        if let data = try? encoder.encode(artifacts) {
            defaults.set(data, forKey: Keys.artifacts)
        }
    }

    func loadArtifacts() -> [String: Artifact] {
        guard let data = defaults.data(forKey: Keys.artifacts),
              let artifacts = try? decoder.decode([String: Artifact].self, from: data) else {
            return [:]
        }
        return artifacts
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
    //
    // Memories are versioned per-key so entries sync cleanly between iOS and
    // RN (per-key LWW with tombstones). The v2 layout is `[String: SyncableMemory]`.
    // Legacy entries stored as `[String: String]` under Keys.memories are
    // migrated once on first access.

    private var memoriesMigratedAt: Double? {
        let v = defaults.double(forKey: Keys.memoriesMigratedAt)
        return v == 0 ? nil : v
    }

    /// Idempotent one-time migration from the legacy `[String: String]` layout
    /// into the versioned `[String: SyncableMemory]` layout. Subsequent calls
    /// are no-ops.
    private func migrateLegacyMemoriesIfNeeded() {
        guard memoriesMigratedAt == nil else { return }
        let now = Date().timeIntervalSince1970 * 1000

        var versioned = loadMemoriesVersionedRaw()

        if let data = defaults.data(forKey: Keys.memories),
           let legacy = try? decoder.decode([String: String].self, from: data) {
            for (key, value) in legacy {
                if versioned[key] == nil {
                    versioned[key] = SyncableMemory(
                        value: value, updatedAt: now,
                        deleted: nil, deletedAt: nil
                    )
                }
            }
        }

        saveMemoriesVersionedRaw(versioned)
        defaults.removeObject(forKey: Keys.memories)
        defaults.set(now, forKey: Keys.memoriesMigratedAt)
    }

    private func loadMemoriesVersionedRaw() -> [String: SyncableMemory] {
        guard let data = defaults.data(forKey: Keys.memoriesVersioned),
              let dict = try? decoder.decode([String: SyncableMemory].self, from: data) else {
            return [:]
        }
        return dict
    }

    private func saveMemoriesVersionedRaw(_ dict: [String: SyncableMemory]) {
        if let data = try? encoder.encode(dict) {
            defaults.set(data, forKey: Keys.memoriesVersioned)
        }
    }

    /// Full versioned memory dictionary including tombstones. Used by sync.
    func loadMemoriesVersioned() -> [String: SyncableMemory] {
        migrateLegacyMemoriesIfNeeded()
        return loadMemoriesVersionedRaw()
    }

    /// Replace the full versioned memory dictionary. Used by sync-merge.
    func saveMemoriesVersioned(_ dict: [String: SyncableMemory]) {
        migrateLegacyMemoriesIfNeeded()
        saveMemoriesVersionedRaw(dict)
    }

    /// Upsert a single memory entry with current timestamp.
    func setMemoryEntry(key: String, value: String) {
        migrateLegacyMemoriesIfNeeded()
        var dict = loadMemoriesVersionedRaw()
        dict[key] = SyncableMemory(
            value: value,
            updatedAt: Date().timeIntervalSince1970 * 1000,
            deleted: nil, deletedAt: nil
        )
        saveMemoriesVersionedRaw(dict)
    }

    /// Tombstone a memory so the deletion propagates on next sync.
    func deleteMemoryEntry(key: String) {
        migrateLegacyMemoriesIfNeeded()
        var dict = loadMemoriesVersionedRaw()
        let ts = Date().timeIntervalSince1970 * 1000
        let existing = dict[key]
        dict[key] = SyncableMemory(
            value: existing?.value ?? "",
            updatedAt: existing?.updatedAt ?? ts,
            deleted: true,
            deletedAt: ts
        )
        saveMemoriesVersionedRaw(dict)
    }

    /// Active (non-deleted) memories as a plain key->value map. UI-facing.
    func loadMemories() -> [String: String] {
        migrateLegacyMemoriesIfNeeded()
        var out: [String: String] = [:]
        for (key, entry) in loadMemoriesVersionedRaw() where entry.deleted != true {
            out[key] = entry.value
        }
        return out
    }

    /// Replace the entire active memory set. Values that differ from the
    /// stored entry (or new keys) get a fresh `updatedAt`; unchanged values
    /// keep their existing timestamp so they don't spuriously win LWW against
    /// edits on other clients. Keys missing from `memories` that were active
    /// before are tombstoned so deletions propagate via sync.
    ///
    /// Callers that want precise semantics should prefer
    /// `setMemoryEntry`/`deleteMemoryEntry`.
    func saveMemories(_ memories: [String: String]) {
        migrateLegacyMemoriesIfNeeded()
        var dict = loadMemoriesVersionedRaw()
        let now = Date().timeIntervalSince1970 * 1000

        for (key, value) in memories {
            let existing = dict[key]
            let changed = existing?.value != value || existing?.deleted == true
            if changed {
                dict[key] = SyncableMemory(
                    value: value, updatedAt: now,
                    deleted: nil, deletedAt: nil
                )
            }
        }

        // Tombstone active keys that are no longer present.
        for (key, entry) in dict where entry.deleted != true && memories[key] == nil {
            dict[key] = SyncableMemory(
                value: entry.value, updatedAt: entry.updatedAt,
                deleted: true, deletedAt: now
            )
        }

        saveMemoriesVersionedRaw(dict)
    }

    func getMemoryValues(for keys: [String]) -> [String: String] {
        let all = loadMemories()
        return keys.reduce(into: [:]) { result, key in
            if let value = all[key] {
                result[key] = value
            }
        }
    }

    // MARK: - Personal Data (short-term memory)

    var personalData: String {
        get { defaults.string(forKey: Keys.personalData) ?? "" }
        set { defaults.set(newValue, forKey: Keys.personalData) }
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
