import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var settingsService: SettingsService
    @State private var language = ""
    @State private var welcomeMessage: String?
    @State private var isLoading = false
    @State private var currentPage = 0

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $currentPage) {
                welcomePage.tag(0)
                languagePage.tag(1)
                readyPage.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .animation(.easeInOut, value: currentPage)
        }
    }

    private var welcomePage: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "sparkles")
                .font(.system(size: 80))
                .foregroundStyle(.blue)

            Text("Welcome to ToGODer")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Your personal AI companion for reflection, growth, and well-being.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()

            Button("Get Started") {
                withAnimation { currentPage = 1 }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer().frame(height: 60)
        }
    }

    private var languagePage: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "globe")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("What language do you prefer?")
                .font(.title2)
                .fontWeight(.semibold)

            TextField("e.g. English, Nederlands, Deutsch...", text: $language)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal, 40)
                .submitLabel(.done)

            Button("Continue") {
                guard !language.isEmpty else { return }
                settingsService.updateSettings { $0.language = language }
                withAnimation { currentPage = 2 }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(language.isEmpty)

            Spacer().frame(height: 60)
        }
    }

    private var readyPage: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)

            Text("You're all set!")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Start a conversation whenever you're ready. ToGODer is here for you.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()

            Button("Let's Go") {
                appState.completeOnboarding()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer().frame(height: 60)
        }
    }
}
