import SwiftUI

@main
struct ToGODerApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(appState.authService)
                .environmentObject(appState.chatService)
                .environmentObject(appState.settingsService)
                .environmentObject(appState.syncService)
                .environmentObject(appState.passcodeService)
                .environmentObject(appState.projectService)
                .environmentObject(appState.artifactService)
                .environmentObject(appState.healthService)
                .environmentObject(appState.calendarService)
                .environmentObject(appState.memoryService)
                .environmentObject(appState.personalDataService)
                .onOpenURL { url in
                    appState.handleDeepLink(url)
                }
        }
    }
}
