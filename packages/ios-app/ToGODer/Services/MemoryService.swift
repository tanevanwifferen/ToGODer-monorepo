import Foundation
import Combine

@MainActor
final class MemoryService: ObservableObject {
    @Published var memories: [String: String] = [:]
    @Published var memoryKeys: [String] = []
    @Published var isCompressing = false

    private let apiClient: APIClient
    private let storage: StorageService
    private weak var personalDataService: PersonalDataService?
    weak var syncService: SyncService?

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage
        self.memories = storage.loadMemories()
        self.memoryKeys = Array(memories.keys).sorted()
    }

    func setPersonalDataService(_ service: PersonalDataService) {
        self.personalDataService = service
    }

    // MARK: - API Methods

    func fetchKeys(from conversationText: String) async -> [String] {
        let existingKeys = Array(memories.keys)
        let request = MemoryFetchKeysRequest(
            shortTermMemory: conversationText,
            existingKeys: existingKeys
        )
        do {
            let response: MemoryFetchKeysResponse = try await apiClient.post(
                "/memory/fetch-keys",
                body: request
            )
            return response.keys
        } catch {
            return []
        }
    }

    /// Dream: consolidate a growing short-term memory into long-term key-value
    /// memories. Splits overflowing personal data into separate keys and
    /// returns a compressed short-term string.
    func compress(shortTermMemory: String) async {
        guard !isCompressing else { return }
        guard !shortTermMemory.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isCompressing = true
        defer { isCompressing = false }

        do {
            let keys = await fetchKeys(from: shortTermMemory)
            let longTermMemory = getValues(for: keys)

            let request = MemoryCompressRequest(
                shortTermMemory: shortTermMemory,
                longTermMemory: longTermMemory
            )
            let response: MemoryCompressResponse = try await apiClient.post(
                "/memory/compress",
                body: request
            )

            var updated = memories
            for (key, value) in response.longTermMemory {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty
                    || trimmed == "null"
                    || trimmed.rangeOfCharacter(from: .letters) == nil {
                    if updated.removeValue(forKey: key) != nil {
                        storage.deleteMemoryEntry(key: key)
                    }
                } else if updated[key] != trimmed {
                    updated[key] = trimmed
                    storage.setMemoryEntry(key: key, value: trimmed)
                }
            }
            memories = updated
            memoryKeys = Array(updated.keys).sorted()
            syncService?.schedulePush()

            // Replace short-term memory with the compressed result so it
            // doesn't keep growing unbounded.
            personalDataService?.set(response.shortTermMemory)
        } catch {
            // Compression is non-critical
        }
    }

    // MARK: - Local Methods

    func updateMemory(key: String, value: String) {
        memories[key] = value
        memoryKeys = Array(memories.keys).sorted()
        storage.setMemoryEntry(key: key, value: value)
        syncService?.schedulePush()
    }

    func deleteMemory(key: String) {
        memories.removeValue(forKey: key)
        memoryKeys = Array(memories.keys).sorted()
        storage.deleteMemoryEntry(key: key)
        syncService?.schedulePush()
    }

    func getValues(for keys: [String]) -> [String: String] {
        keys.reduce(into: [:]) { result, key in
            if let value = memories[key] {
                result[key] = value
            }
        }
    }
}
