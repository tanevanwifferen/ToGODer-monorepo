import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var isFirstLaunch: Bool
    @Published var isOnboarded: Bool

    let authService: AuthService
    let chatService: ChatService
    let settingsService: SettingsService
    let syncService: SyncService
    let balanceService: BalanceService

    private let apiClient: APIClient
    private let storage: StorageService
    private var cancellables = Set<AnyCancellable>()

    init() {
        let storage = StorageService()
        self.storage = storage
        self.isFirstLaunch = !storage.hasLaunched
        self.isOnboarded = storage.isOnboarded

        self.apiClient = APIClient(baseURL: Configuration.apiBaseURL)
        self.authService = AuthService(apiClient: apiClient, storage: storage)
        self.settingsService = SettingsService(storage: storage)
        self.balanceService = BalanceService(apiClient: apiClient)
        self.chatService = ChatService(
            apiClient: apiClient,
            storage: storage,
            settingsService: settingsService
        )
        self.syncService = SyncService(apiClient: apiClient, storage: storage)

        setupBindings()
    }

    func loadGlobalConfig() async {
        await settingsService.loadGlobalConfig(apiClient: apiClient)
    }

    private func setupBindings() {
        authService.$isAuthenticated
            .removeDuplicates()
            .sink { [weak self] isAuth in
                if isAuth {
                    Task { [weak self] in
                        await self?.balanceService.fetchBalance()
                        await self?.syncService.pull()
                    }
                }
            }
            .store(in: &cancellables)
    }

    func completeOnboarding() {
        storage.isOnboarded = true
        isOnboarded = true
        if isFirstLaunch {
            storage.hasLaunched = true
            isFirstLaunch = false
        }
    }
}
