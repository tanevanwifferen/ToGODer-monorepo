import Foundation
import CryptoKit
import CommonCrypto

// MARK: - Sync Payload (matches RN SyncPayload structure)

/// Intermediate structure for decoding the sync payload from the server.
/// Uses epoch milliseconds for all timestamps to match the RN app format.
struct SyncPayload: Codable {
    var version: Int
    var syncedAt: Double // epoch ms
    var chats: [String: SyncableChat]
    var personal: SyncablePersonal
    var userSettings: SyncableUserSettings
    var projects: [String: SyncableProject]?
    var artifacts: [String: SyncableArtifact]?
}

struct SyncableChat: Codable {
    var id: String
    var title: String?
    var messages: [SyncableMessage]
    var isRequest: Bool
    var memories: [String]?
    var draftInputText: String?
    var projectId: String?
    var updatedAt: Double // epoch ms
    var deleted: Bool?
    var deletedAt: Double? // epoch ms
}

struct SyncableMessage: Codable {
    var id: String
    var content: String
    var role: String
    var signature: String?
    var timestamp: Double // epoch ms
    var hidden: Bool?
    var deleted: Bool?
    var deletedAt: Double? // epoch ms
}

struct SyncablePersonal: Codable {
    var data: AnyCodable?
    var persona: String
    var updatedAt: Double // epoch ms
}

struct SyncableUserSettings: Codable {
    var model: String?
    var humanPrompt: Bool?
    var keepGoing: Bool?
    var outsideBox: Bool?
    var holisticTherapist: Bool?
    var communicationStyle: Int?
    var assistant_name: String?
    var language: String?
    var libraryIntegrationEnabled: Bool?
    var updatedAt: Double // epoch ms
}

struct SyncableProject: Codable {
    var id: String
    var name: String
    var description: String?
    var chatIds: [String]?
    var createdAt: Double // epoch ms
    var updatedAt: Double // epoch ms
    var deleted: Bool?
    var deletedAt: Double? // epoch ms
}

struct SyncableArtifact: Codable {
    var id: String
    var projectId: String
    var name: String
    var type: String // "file" or "folder"
    var parentId: String?
    var content: String?
    var createdAt: Double // epoch ms
    var updatedAt: Double // epoch ms
    var deleted: Bool?
    var deletedAt: Double? // epoch ms
}

/// A type-erased Codable wrapper for arbitrary JSON values (needed for personal.data)
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}

// MARK: - Sync Service

@MainActor
final class SyncService: ObservableObject {
    @Published var isSyncing = false
    @Published var lastSyncError: String?
    /// Whether a successful pull has completed. Push is gated on this to prevent
    /// overwriting server data with empty local state.
    @Published private(set) var hasPulledSuccessfully = false

    private let apiClient: APIClient
    private let storage: StorageService
    private var syncTask: Task<Void, Never>?
    private var encryptionKey: Data?

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage
    }

    // MARK: - Credentials & Key Derivation (PBKDF2 to match RN app)

    func setCredentials(userId: String, password: String) {
        let salt = "togoder-sync-\(userId)"
        guard let passwordData = password.data(using: .utf8),
              let saltData = salt.data(using: .utf8) else {
            print("[SyncService] ERROR: Failed to encode password/salt as UTF-8")
            lastSyncError = "Failed to derive encryption key: encoding error"
            return
        }

        var derivedKey = Data(count: 32) // 256-bit key
        let result = derivedKey.withUnsafeMutableBytes { derivedKeyBytes in
            passwordData.withUnsafeBytes { passwordBytes in
                saltData.withUnsafeBytes { saltBytes in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        passwordBytes.baseAddress?.assumingMemoryBound(to: Int8.self),
                        passwordData.count,
                        saltBytes.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        saltData.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        100_000, // iterations - must match RN
                        derivedKeyBytes.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        32
                    )
                }
            }
        }

        if result == kCCSuccess {
            encryptionKey = derivedKey
            print("[SyncService] Encryption key derived successfully via PBKDF2")
        } else {
            print("[SyncService] ERROR: PBKDF2 key derivation failed with status \(result)")
            lastSyncError = "Failed to derive encryption key"
            encryptionKey = nil
        }
    }

    // MARK: - Encryption (AES-256-GCM, blob format: [12-byte IV][ciphertext][16-byte tag])

    private func encrypt(_ data: Data) -> String? {
        guard let keyData = encryptionKey else {
            print("[SyncService] ERROR: Cannot encrypt - no encryption key")
            return nil
        }
        let key = SymmetricKey(data: keyData)
        do {
            let nonce = AES.GCM.Nonce()
            let sealed = try AES.GCM.seal(data, using: key, nonce: nonce)
            // Build blob: [12 bytes IV][ciphertext][16 bytes tag]
            // AES.GCM.SealedBox.combined is: nonce + ciphertext + tag
            guard let combined = sealed.combined else {
                print("[SyncService] ERROR: Failed to get combined sealed box")
                return nil
            }
            return combined.base64EncodedString()
        } catch {
            print("[SyncService] ERROR: Encryption failed: \(error)")
            return nil
        }
    }

    private func decrypt(_ encoded: String) -> Data? {
        guard let keyData = encryptionKey else {
            print("[SyncService] ERROR: Cannot decrypt - no encryption key")
            return nil
        }
        let key = SymmetricKey(data: keyData)
        guard let combined = Data(base64Encoded: encoded) else {
            print("[SyncService] ERROR: Failed to base64-decode encrypted data (length: \(encoded.count))")
            return nil
        }
        do {
            // combined format: [12 bytes nonce][ciphertext][16 bytes tag]
            // CryptoKit's SealedBox(combined:) expects exactly this format
            let box = try AES.GCM.SealedBox(combined: combined)
            return try AES.GCM.open(box, using: key)
        } catch {
            print("[SyncService] ERROR: Decryption failed: \(error)")
            lastSyncError = "Decryption failed - key mismatch or corrupted data"
            return nil
        }
    }

    // MARK: - Pull

    func pull() async {
        guard encryptionKey != nil else {
            print("[SyncService] WARNING: pull() called without encryption key, skipping")
            return
        }

        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }

        do {
            let response: SyncPullResponse = try await apiClient.get("/sync")
            print("[SyncService] Pull response - version: \(response.version), hasData: \(response.encryptedData != nil)")

            guard let encryptedData = response.encryptedData else {
                print("[SyncService] No encrypted data in response")
                return
            }

            guard let decrypted = decrypt(encryptedData) else {
                print("[SyncService] ERROR: Failed to decrypt sync data")
                return
            }

            print("[SyncService] Decrypted \(decrypted.count) bytes")

            let decoder = JSONDecoder()
            do {
                let remote = try decoder.decode(SyncPayload.self, from: decrypted)
                print("[SyncService] Decoded remote payload - chats: \(remote.chats.count), version: \(remote.version)")
                mergePayload(remote)
                storage.syncVersion = response.version
                hasPulledSuccessfully = true
                print("[SyncService] Pull completed successfully, push is now enabled")
            } catch {
                print("[SyncService] ERROR: Failed to decode SyncPayload: \(error)")
                lastSyncError = "Failed to decode sync data: \(error.localizedDescription)"
                // Do NOT set hasPulledSuccessfully - push stays blocked
            }
        } catch let apiError as APIError {
            switch apiError {
            case .httpError(let statusCode, _) where statusCode == 404:
                print("[SyncService] No remote sync data (404) - first sync for this user")
                // No remote data exists yet, so it's safe to push local data
                hasPulledSuccessfully = true
                await push()
            default:
                print("[SyncService] ERROR: Pull API request failed: \(apiError.localizedDescription)")
                lastSyncError = "Sync pull failed: \(apiError.localizedDescription)"
            }
        } catch {
            print("[SyncService] ERROR: Pull failed with unexpected error: \(error)")
            lastSyncError = "Sync pull failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Push

    func push() async {
        guard encryptionKey != nil else {
            print("[SyncService] WARNING: push() called without encryption key, skipping")
            return
        }
        guard hasPulledSuccessfully else {
            print("[SyncService] WARNING: push() blocked - no successful pull yet (prevents overwriting server data)")
            return
        }

        isSyncing = true
        defer { isSyncing = false }

        let payload = buildLocalPayload()

        let encoder = JSONEncoder()
        guard let jsonData = try? encoder.encode(payload) else {
            print("[SyncService] ERROR: Failed to encode local payload")
            lastSyncError = "Failed to encode sync data"
            return
        }

        guard let encrypted = encrypt(jsonData) else {
            print("[SyncService] ERROR: Failed to encrypt sync data")
            return
        }

        let version = storage.syncVersion + 1
        let syncData = SyncRequest(encryptedData: encrypted, version: version)

        do {
            try await apiClient.post("/sync", body: syncData)
            storage.syncVersion = version
            print("[SyncService] Push completed, version: \(version)")
        } catch {
            print("[SyncService] ERROR: Push failed: \(error)")
            lastSyncError = "Sync push failed: \(error.localizedDescription)"
        }
    }

    func schedulePush() {
        guard hasPulledSuccessfully else {
            print("[SyncService] WARNING: schedulePush() blocked - no successful pull yet")
            return
        }
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .seconds(Configuration.syncDebounceInterval))
            guard !Task.isCancelled else { return }
            await push()
        }
    }

    // MARK: - Build Local Payload (convert iOS models to RN-compatible format)

    private func buildLocalPayload() -> SyncPayload {
        let localChats = storage.loadChats()
        let settings = storage.loadSettings()
        let _ = storage.loadMemories() // loaded but not yet included in payload
        let projects = storage.loadProjects()
        let artifacts = storage.loadArtifacts()

        // Convert chats to syncable format
        var syncChats: [String: SyncableChat] = [:]
        for (id, chat) in localChats {
            let syncMessages = chat.messages.map { msg in
                SyncableMessage(
                    id: msg.id,
                    content: msg.content,
                    role: msg.role.rawValue,
                    signature: msg.signature,
                    timestamp: (msg.timestamp ?? .distantPast).timeIntervalSince1970 * 1000,
                    hidden: msg.hidden,
                    deleted: msg.deleted,
                    deletedAt: msg.deletedAt.map { $0.timeIntervalSince1970 * 1000 }
                )
            }
            syncChats[id] = SyncableChat(
                id: id,
                title: chat.title,
                messages: syncMessages,
                isRequest: chat.isRequest,
                memories: chat.memories,
                draftInputText: chat.draftInputText,
                projectId: chat.projectId,
                updatedAt: (chat.lastUpdate ?? .distantPast).timeIntervalSince1970 * 1000,
                deleted: chat.deleted,
                deletedAt: chat.deletedAt.map { $0.timeIntervalSince1970 * 1000 }
            )
        }

        // Convert settings
        let syncSettings = SyncableUserSettings(
            model: settings.model,
            humanPrompt: settings.humanPrompt,
            keepGoing: settings.keepGoing,
            outsideBox: settings.outsideBox,
            holisticTherapist: settings.holisticTherapist,
            communicationStyle: settings.communicationStyle.rawValue,
            assistant_name: settings.assistantName,
            language: settings.language,
            libraryIntegrationEnabled: settings.libraryIntegrationEnabled,
            updatedAt: Date().timeIntervalSince1970 * 1000
        )

        // Convert projects
        var syncProjects: [String: SyncableProject] = [:]
        for (id, project) in projects {
            syncProjects[id] = SyncableProject(
                id: id,
                name: project.name,
                description: project.description,
                chatIds: localChats.values.filter { $0.projectId == id }.map { $0.id },
                createdAt: project.createdAt.timeIntervalSince1970 * 1000,
                updatedAt: project.updatedAt.timeIntervalSince1970 * 1000,
                deleted: project.deleted,
                deletedAt: project.deletedAt.map { $0.timeIntervalSince1970 * 1000 }
            )
        }

        // Convert artifacts
        var syncArtifacts: [String: SyncableArtifact] = [:]
        for (id, artifact) in artifacts {
            syncArtifacts[id] = SyncableArtifact(
                id: id,
                projectId: artifact.projectId,
                name: artifact.name,
                type: artifact.type.rawValue,
                parentId: artifact.parentId,
                content: artifact.content,
                createdAt: artifact.createdAt.timeIntervalSince1970 * 1000,
                updatedAt: artifact.updatedAt.timeIntervalSince1970 * 1000,
                deleted: artifact.deleted,
                deletedAt: artifact.deletedAt.map { $0.timeIntervalSince1970 * 1000 }
            )
        }

        return SyncPayload(
            version: 1,
            syncedAt: Date().timeIntervalSince1970 * 1000,
            chats: syncChats,
            personal: SyncablePersonal(
                data: nil,
                persona: settings.persona ?? "",
                updatedAt: 0
            ),
            userSettings: syncSettings,
            projects: syncProjects,
            artifacts: syncArtifacts
        )
    }

    // MARK: - LWW Merge

    private func mergePayload(_ remote: SyncPayload) {
        print("[SyncService] Starting merge...")

        // Merge chats using LWW on updatedAt (epoch ms)
        var localChats = storage.loadChats()
        for (id, remoteChat) in remote.chats {
            let localChat = localChats[id]
            if let localChat = localChat {
                let localTime = (localChat.lastUpdate ?? .distantPast).timeIntervalSince1970 * 1000
                let remoteTime = remoteChat.updatedAt
                if remoteTime > localTime {
                    localChats[id] = convertToChat(remoteChat)
                    print("[SyncService] Chat \(id): remote wins (remote=\(remoteTime) > local=\(localTime))")
                } else {
                    print("[SyncService] Chat \(id): local wins (local=\(localTime) >= remote=\(remoteTime))")
                }
            } else {
                localChats[id] = convertToChat(remoteChat)
                print("[SyncService] Chat \(id): new from remote")
            }
        }
        storage.saveChats(localChats)
        print("[SyncService] Merged chats: \(localChats.count) total")

        // Merge settings from userSettings field
        if let model = remote.userSettings.model, !model.isEmpty {
            var settings = storage.loadSettings()
            settings.model = model
            if let hp = remote.userSettings.humanPrompt { settings.humanPrompt = hp }
            if let kg = remote.userSettings.keepGoing { settings.keepGoing = kg }
            if let ob = remote.userSettings.outsideBox { settings.outsideBox = ob }
            if let ht = remote.userSettings.holisticTherapist { settings.holisticTherapist = ht }
            if let cs = remote.userSettings.communicationStyle,
               let style = CommunicationStyle(rawValue: cs) {
                settings.communicationStyle = style
            }
            if let name = remote.userSettings.assistant_name { settings.assistantName = name }
            if let lang = remote.userSettings.language { settings.language = lang }
            if let lib = remote.userSettings.libraryIntegrationEnabled { settings.libraryIntegrationEnabled = lib }
            storage.saveSettings(settings)
            print("[SyncService] Merged settings")
        }

        // Merge memories from personal.data if it contains memory-like data
        // The RN app stores memories separately in the personal slice
        // For now, we preserve local memories and don't overwrite from personal

        // Merge projects
        if let remoteProjects = remote.projects {
            var localProjects = storage.loadProjects()
            for (id, remoteProject) in remoteProjects {
                if let localProject = localProjects[id] {
                    let localTime = localProject.updatedAt.timeIntervalSince1970 * 1000
                    if remoteProject.updatedAt > localTime {
                        localProjects[id] = convertToProject(remoteProject)
                    }
                } else {
                    localProjects[id] = convertToProject(remoteProject)
                }
            }
            storage.saveProjects(localProjects)
            print("[SyncService] Merged projects: \(localProjects.count) total")
        }

        // Merge artifacts
        if let remoteArtifacts = remote.artifacts {
            var localArtifacts = storage.loadArtifacts()
            for (id, remoteArtifact) in remoteArtifacts {
                if let localArtifact = localArtifacts[id] {
                    let localTime = localArtifact.updatedAt.timeIntervalSince1970 * 1000
                    if remoteArtifact.updatedAt > localTime {
                        localArtifacts[id] = convertToArtifact(remoteArtifact)
                    }
                } else {
                    localArtifacts[id] = convertToArtifact(remoteArtifact)
                }
            }
            storage.saveArtifacts(localArtifacts)
            print("[SyncService] Merged artifacts: \(localArtifacts.count) total")
        }

        print("[SyncService] Merge complete")
    }

    // MARK: - Conversion helpers (SyncPayload epoch ms -> iOS Date models)

    private func convertToChat(_ syncChat: SyncableChat) -> Chat {
        let messages = syncChat.messages.map { msg in
            ChatMessage(
                id: msg.id,
                content: msg.content,
                role: MessageRole(rawValue: msg.role) ?? .user,
                signature: msg.signature,
                timestamp: Date(timeIntervalSince1970: msg.timestamp / 1000),
                hidden: msg.hidden
            )
        }
        var chat = Chat(
            id: syncChat.id,
            title: syncChat.title,
            messages: messages,
            isRequest: syncChat.isRequest,
            lastUpdate: Date(timeIntervalSince1970: syncChat.updatedAt / 1000),
            memories: syncChat.memories ?? [],
            draftInputText: syncChat.draftInputText,
            projectId: syncChat.projectId
        )
        chat.deleted = syncChat.deleted
        chat.deletedAt = syncChat.deletedAt.map { Date(timeIntervalSince1970: $0 / 1000) }
        return chat
    }

    private func convertToProject(_ syncProject: SyncableProject) -> Project {
        var project = Project(
            id: syncProject.id,
            name: syncProject.name,
            description: syncProject.description
        )
        project.createdAt = Date(timeIntervalSince1970: syncProject.createdAt / 1000)
        project.updatedAt = Date(timeIntervalSince1970: syncProject.updatedAt / 1000)
        project.deleted = syncProject.deleted
        project.deletedAt = syncProject.deletedAt.map { Date(timeIntervalSince1970: $0 / 1000) }
        return project
    }

    private func convertToArtifact(_ syncArtifact: SyncableArtifact) -> Artifact {
        var artifact = Artifact(
            id: syncArtifact.id,
            projectId: syncArtifact.projectId,
            name: syncArtifact.name,
            type: ArtifactType(rawValue: syncArtifact.type) ?? .file,
            parentId: syncArtifact.parentId,
            content: syncArtifact.content
        )
        artifact.createdAt = Date(timeIntervalSince1970: syncArtifact.createdAt / 1000)
        artifact.updatedAt = Date(timeIntervalSince1970: syncArtifact.updatedAt / 1000)
        artifact.deleted = syncArtifact.deleted
        artifact.deletedAt = syncArtifact.deletedAt.map { Date(timeIntervalSince1970: $0 / 1000) }
        return artifact
    }
}
