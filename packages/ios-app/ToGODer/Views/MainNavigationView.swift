import SwiftUI

extension String: @retroactive Identifiable {
    public var id: String { self }
}

struct MainNavigationView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var settingsService: SettingsService
    @State private var searchText = ""
    @State private var showAllChats = false
    private let initialChatLimit = 20

    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            sidebar
                .navigationDestination(for: String.self) { chatId in
                    ChatView(chatId: chatId)
                }
        }
        .onChange(of: chatService.currentChatId) { _, newValue in
            if let chatId = newValue {
                // Clear and push to avoid stacking multiple chat views
                navigationPath = NavigationPath()
                navigationPath.append(chatId)
            }
        }
        .sheet(item: $appState.deepLinkSharedChatId) { id in
            NavigationStack {
                DeepLinkSharedChatSheet(sharedChatId: id)
                    .environmentObject(chatService)
            }
        }
    }

    private var filteredChats: [Chat] {
        let chats = chatService.sortedChats
        if searchText.isEmpty {
            return chats
        }
        return chats.filter { $0.displayTitle.localizedCaseInsensitiveContains(searchText) }
    }

    private var visibleChats: [Chat] {
        let chats = filteredChats
        if showAllChats || !searchText.isEmpty {
            return chats
        }
        return Array(chats.prefix(initialChatLimit))
    }

    private var hasMoreChats: Bool {
        searchText.isEmpty && !showAllChats && filteredChats.count > initialChatLimit
    }

    private var hiddenChatCount: Int {
        filteredChats.count - initialChatLimit
    }

    private var sidebar: some View {
        List {
            Section {
                Button {
                    let chat = chatService.createChat()
                    chatService.selectChat(chat.id)
                } label: {
                    Label("New Chat", systemImage: "plus.circle.fill")
                }
            }

            Section("Conversations") {
                ForEach(visibleChats) { chat in
                    Button {
                        chatService.selectChat(chat.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(chat.displayTitle)
                                .lineLimit(1)
                                .fontWeight(chat.id == chatService.currentChatId ? .semibold : .regular)
                            if let date = chat.lastUpdate {
                                Text(date, style: .relative)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            chatService.deleteChat(chat.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }

                if hasMoreChats {
                    Button {
                        withAnimation {
                            showAllChats = true
                        }
                    } label: {
                        Label("Show \(hiddenChatCount) More", systemImage: "ellipsis.circle")
                            .foregroundStyle(.secondary)
                    }
                }

                if showAllChats && searchText.isEmpty {
                    Button {
                        withAnimation {
                            showAllChats = false
                        }
                    } label: {
                        Label("Show Less", systemImage: "chevron.up.circle")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                NavigationLink {
                    SharedConversationsView()
                } label: {
                    Label("Shared", systemImage: "person.2")
                }

                NavigationLink {
                    ProjectsView()
                } label: {
                    Label("Projects", systemImage: "folder")
                }

                NavigationLink {
                    SettingsView()
                } label: {
                    Label("Settings", systemImage: "gear")
                }

                if authService.isAuthenticated {
                    NavigationLink {
                        AccountView()
                    } label: {
                        Label("Account", systemImage: "person.circle")
                    }
                } else {
                    NavigationLink {
                        LoginView()
                    } label: {
                        Label("Sign In", systemImage: "person.badge.key")
                    }
                }

                NavigationLink {
                    DonateView()
                } label: {
                    Label("Support ToGODer", systemImage: "heart")
                }
            }
        }
        .navigationTitle("ToGODer")
        .listStyle(.sidebar)
        .searchable(text: $searchText, prompt: "Search conversations")
        .onChange(of: searchText) {
            if !searchText.isEmpty {
                showAllChats = false
            }
        }
    }
}

struct DeepLinkSharedChatSheet: View {
    let sharedChatId: String
    @EnvironmentObject var chatService: ChatService
    @Environment(\.dismiss) private var dismiss
    @State private var sharedChat: SharedChat?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading shared conversation...")
            } else if let sharedChat {
                SharedChatDetailView(sharedChat: sharedChat)
            } else if let error {
                ContentUnavailableView(
                    "Could not load conversation",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await loadSharedChat()
        }
    }

    private func loadSharedChat() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let chat: SharedChat = try await chatService.apiClient.get("/share/\(sharedChatId)")
            sharedChat = chat
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct EmptyChatView: View {
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var settingsService: SettingsService
    @State private var quote: String?
    @State private var isLoadingExperience = false

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            Text(settingsService.settings.assistantName)
                .font(.largeTitle)
                .fontWeight(.bold)

            if let quote = quote {
                Text(quote)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Button("Start a Conversation") {
                let chat = chatService.createChat()
                chatService.selectChat(chat.id)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            if isLoadingExperience {
                ProgressView("Starting experience...")
            } else {
                VStack(spacing: 12) {
                    Text("Quick Start")
                        .font(.headline)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 12) {
                        Button {
                            startExperience()
                        } label: {
                            Label("5-Minute Check-in", systemImage: "clock")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)

                        Button {
                            startExperience()
                        } label: {
                            Label("15-Minute Deep Dive", systemImage: "brain.head.profile")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)
                    }
                }
                .padding(.top, 8)
            }
        }
        .task {
            if let config = settingsService.globalConfig {
                quote = config.quote
            }
        }
    }

    private func startExperience() {
        isLoadingExperience = true
        Task {
            let chatId = await chatService.startExperience(
                language: settingsService.settings.language
            )
            chatService.selectChat(chatId)
            isLoadingExperience = false
        }
    }
}
