import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var passcodeService: PasscodeService
    @EnvironmentObject var memoryService: MemoryService
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
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

            if memoryService.isCompressing {
                DreamingView()
                    .zIndex(1)
            }

            if passcodeService.isLocked {
                PasscodeView(mode: .unlock)
                    .transition(.opacity)
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                passcodeService.lock()
            }
        }
    }
}
