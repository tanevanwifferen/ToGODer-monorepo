import Foundation
import Combine

@MainActor
final class MemoryService: ObservableObject {
    @Published var memories: [String: String] = [:]
    @Published var memoryKeys: [String] = []
    @Published var isCompressing = false

    private let apiClient: APIClient
    private let storage: StorageService

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage
        self.memories = storage.loadMemories()
        self.memoryKeys = Array(memories.keys).sorted()
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

    func compress(shortTermMemory: String) async {
        guard !isCompressing else { return }
        isCompressing = true
        defer { isCompressing = false }

        do {
            // Fetch relevant keys first
            let keys = await fetchKeys(from: shortTermMemory)

            // Build long-term memory map from relevant keys
            let longTermMemory = getValues(for: keys)

            let request = MemoryCompressRequest(
                shortTermMemory: shortTermMemory,
                longTermMemory: longTermMemory
            )
            let response: MemoryCompressResponse = try await apiClient.post(
                "/memory/compress",
                body: request
            )

            // Update stored memories with compressed result
            var updated = memories
            for (key, value) in response.longTermMemory {
                if value.isEmpty || value == "null" {
                    updated.removeValue(forKey: key)
                } else {
                    updated[key] = value
                }
            }
            memories = updated
            memoryKeys = Array(updated.keys).sorted()
            storage.saveMemories(updated)
        } catch {
            // Compression is non-critical
        }
    }

    // MARK: - Local Methods

    func updateMemory(key: String, value: String) {
        memories[key] = value
        memoryKeys = Array(memories.keys).sorted()
        storage.saveMemories(memories)
    }

    func deleteMemory(key: String) {
        memories.removeValue(forKey: key)
        memoryKeys = Array(memories.keys).sorted()
        storage.saveMemories(memories)
    }

    func getValues(for keys: [String]) -> [String: String] {
        keys.reduce(into: [:]) { result, key in
            if let value = memories[key] {
                result[key] = value
            }
        }
    }
}
