import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var isFirstLaunch: Bool
    @Published var isOnboarded: Bool
    @Published var deepLinkSharedChatId: String?

    let authService: AuthService
    let chatService: ChatService
    let settingsService: SettingsService
    let syncService: SyncService
    let balanceService: BalanceService
    let passcodeService: PasscodeService
    let calendarService: CalendarService
    let healthService: HealthService
    let memoryService: MemoryService
    let projectService: ProjectService
    let artifactService: ArtifactService

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
        self.passcodeService = PasscodeService(storage: storage)
        self.calendarService = CalendarService()
        self.healthService = HealthService()
        self.memoryService = MemoryService(apiClient: apiClient, storage: storage)
        self.artifactService = ArtifactService(storage: storage)
        self.chatService.calendarService = calendarService
        self.chatService.healthService = healthService
        self.chatService.syncService = syncService
        self.chatService.artifactService = artifactService
        self.projectService = ProjectService(storage: storage, chatService: chatService)

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
                        guard let self else { return }
                        // Derive encryption key from credentials
                        if let userId = self.storage.userId,
                           let password = self.authService.password {
                            self.syncService.setCredentials(userId: userId, password: password)
                        }
                        await self.balanceService.fetchBalance()
                        await self.settingsService.loadGlobalConfig(apiClient: self.apiClient)
                        await self.syncService.pull()
                        // Reload all data after sync pull merges remote data
                        self.chatService.chats = self.storage.loadChats()
                        self.projectService.projects = self.storage.loadProjects()
                        self.artifactService.artifacts = self.storage.loadArtifacts()
                        self.memoryService.memories = self.storage.loadMemories()
                        self.memoryService.memoryKeys = Array(self.memoryService.memories.keys).sorted()
                    }
                }
            }
            .store(in: &cancellables)
    }

    func handleDeepLink(_ url: URL) {
        // togoder://shared/{id}
        if url.scheme == "togoder", url.host == "shared" {
            let id = url.pathComponents.dropFirst().first
            if let id, !id.isEmpty {
                deepLinkSharedChatId = id
            }
            return
        }

        // https://dev.togoder.click/shared/{id}
        if url.scheme == "https",
           url.host == Configuration.shareBaseURL.host,
           url.pathComponents.count >= 3,
           url.pathComponents[1] == "shared" {
            let id = url.pathComponents[2]
            if !id.isEmpty {
                deepLinkSharedChatId = id
            }
            return
        }
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
