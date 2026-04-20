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
        }
    }
}
