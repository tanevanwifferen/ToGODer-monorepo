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
        settings.updatedAt = Date()
        storage.saveSettings(settings)
    }

    func loadGlobalConfig(apiClient: APIClient) async {
        do {
            let config: GlobalConfig = try await apiClient.get("/global_config")
            globalConfig = config
            if let models = config.models, !models.isEmpty {
                availableModels = models
            }
            applyDefaultModel(from: config)
        } catch {
            // Non-critical
        }

        // Fetch available prompts separately (not included in global_config)
        do {
            let prompts: [String: PromptOption] = try await apiClient.get("/prompts")
            if globalConfig != nil {
                globalConfig?.prompts = prompts
            } else {
                globalConfig = GlobalConfig(donateOptions: nil, quote: nil, models: nil, prompts: prompts, showLogin: nil, userOnboarded: nil, appFirstLaunch: nil, libraryIntegrationEnabled: nil, librarianApiUrl: nil, previousDefaultModel: nil)
            }
        } catch {
            // Non-critical
        }
    }

    private func applyDefaultModel(from config: GlobalConfig) {
        let defaultModel = config.models?.first?.model ?? ""
        let previousDefault = config.previousDefaultModel ?? ""
        let currentModel = settings.model
        // Only update if the server default changed AND the user hasn't
        // explicitly chosen a different model (still on the old default).
        // An explicitly chosen model is never overwritten here — resetting
        // it stamps updatedAt and the reset then syncs to every device.
        let userStillOnOldDefault = currentModel.isEmpty || currentModel == previousDefault
        if !defaultModel.isEmpty,
           defaultModel != currentModel,
           userStillOnOldDefault {
            updateSettings { $0.model = defaultModel }
        }
    }
}
