import Foundation
import Combine

@MainActor
final class SettingsService: ObservableObject {
    @Published var settings: UserSettings
    @Published var availableModels: [ModelOption] = []
    @Published var globalConfig: GlobalConfig?

    private let storage: StorageService

    init(storage: StorageService) {
        self.storage = storage
        self.settings = storage.loadSettings()
    }

    func updateSettings(_ update: (inout UserSettings) -> Void) {
        update(&settings)
        storage.saveSettings(settings)
    }

    func loadGlobalConfig(apiClient: APIClient) async {
        do {
            let config: GlobalConfig = try await apiClient.get("/global_config")
            globalConfig = config
            if let models = config.models, !models.isEmpty {
                availableModels = models
            }
        } catch {
            // Non-critical
        }
    }
}
