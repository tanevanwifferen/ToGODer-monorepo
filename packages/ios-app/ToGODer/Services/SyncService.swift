import Foundation
import CryptoKit

// MARK: - Sync Payload

struct SyncPayload: Codable {
    var chats: [String: Chat]
    var settings: UserSettings
    var memories: [String: String]
    var timestamp: Date
}

@MainActor
final class SyncService: ObservableObject {
    @Published var isSyncing = false

    private let apiClient: APIClient
    private let storage: StorageService
    private var syncTask: Task<Void, Never>?
    private var encryptionKey: SymmetricKey?

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage
    }

    // MARK: - Credentials & Key Derivation

    func setCredentials(userId: String, password: String) {
        let material = "\(userId):\(password)"
        let hash = SHA256.hash(data: Data(material.utf8))
        encryptionKey = SymmetricKey(data: hash)
    }

    // MARK: - Encryption

    private func encrypt(_ data: Data) -> String? {
        guard let key = encryptionKey else { return nil }
        do {
            let sealed = try AES.GCM.seal(data, using: key)
            guard let combined = sealed.combined else { return nil }
            return combined.base64EncodedString()
        } catch {
            return nil
        }
    }

    private func decrypt(_ encoded: String) -> Data? {
        guard let key = encryptionKey,
              let combined = Data(base64Encoded: encoded) else { return nil }
        do {
            let box = try AES.GCM.SealedBox(combined: combined)
            return try AES.GCM.open(box, using: key)
        } catch {
            return nil
        }
    }

    // MARK: - Pull

    func pull() async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response: SyncResponse = try await apiClient.get("/sync")
            if let encryptedData = response.encryptedData, let version = response.version {
                guard let decrypted = decrypt(encryptedData) else { return }
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                guard let remote = try? decoder.decode(SyncPayload.self, from: decrypted) else { return }

                mergePayload(remote)
                storage.syncVersion = version
            }
        } catch {
            // Sync failures are non-critical
        }
    }

    // MARK: - Push

    func push() async {
        guard encryptionKey != nil else { return }

        isSyncing = true
        defer { isSyncing = false }

        let payload = SyncPayload(
            chats: storage.loadChats(),
            settings: storage.loadSettings(),
            memories: storage.loadMemories(),
            timestamp: Date()
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let jsonData = try? encoder.encode(payload),
              let encrypted = encrypt(jsonData) else { return }

        let version = storage.syncVersion + 1
        let syncData = SyncRequest(encryptedData: encrypted, version: version)

        do {
            try await apiClient.post("/sync", body: syncData)
            storage.syncVersion = version
        } catch {
            // Sync failures are non-critical
        }
    }

    func schedulePush() {
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .seconds(Configuration.syncDebounceInterval))
            guard !Task.isCancelled else { return }
            await push()
        }
    }

    // MARK: - LWW Merge

    private func mergePayload(_ remote: SyncPayload) {
        // Merge chats using LWW on lastUpdate
        var localChats = storage.loadChats()
        for (id, remoteChat) in remote.chats {
            if let localChat = localChats[id] {
                let localTime = localChat.lastUpdate ?? .distantPast
                let remoteTime = remoteChat.lastUpdate ?? .distantPast
                if remoteTime > localTime {
                    localChats[id] = remoteChat
                }
            } else {
                localChats[id] = remoteChat
            }
        }
        storage.saveChats(localChats)

        // Merge settings: remote wins (no per-field timestamps available)
        storage.saveSettings(remote.settings)

        // Merge memories: remote values overwrite local (LWW per key)
        var localMemories = storage.loadMemories()
        for (key, value) in remote.memories {
            localMemories[key] = value
        }
        storage.saveMemories(localMemories)
    }
}
