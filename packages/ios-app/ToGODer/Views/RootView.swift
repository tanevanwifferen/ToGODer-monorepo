import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if !appState.isOnboarded {
                OnboardingView()
            } else {
                MainNavigationView()
            }
        }
        .task {
            await appState.loadGlobalConfig()
        }
    }
}
