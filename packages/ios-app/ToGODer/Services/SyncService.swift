import Foundation
import CryptoKit

@MainActor
final class SyncService: ObservableObject {
    @Published var isSyncing = false

    private let apiClient: APIClient
    private let storage: StorageService
    private var syncTask: Task<Void, Never>?

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage
    }

    func pull() async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response: SyncResponse = try await apiClient.get("/sync")
            if let _ = response.encryptedData, let version = response.version {
                storage.syncVersion = version
                // Decryption would happen here with user's key
                // For now, store the raw data
            }
        } catch {
            // Sync failures are non-critical
        }
    }

    func push() async {
        isSyncing = true
        defer { isSyncing = false }

        let version = storage.syncVersion + 1
        // Encryption would happen here
        let syncData = SyncRequest(encryptedData: "", version: version)

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
}
