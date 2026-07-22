import SwiftUI

extension String: @retroactive Identifiable {
    public var id: String { self }
}

struct MainNavigationView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var settingsService: SettingsService
    @EnvironmentObject var projectService: ProjectService
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
        .onChange(of: chatService.currentChatId) { oldValue, newValue in
            guard let chatId = newValue, oldValue != newValue else { return }
            open(chatId: chatId)
        }
        .sheet(item: $appState.deepLinkSharedChatId) { id in
            NavigationStack {
                DeepLinkSharedChatSheet(sharedChatId: id)
                    .environmentObject(chatService)
            }
        }
        .sheet(item: $appState.deepLinkSharedArtifactId) { id in
            NavigationStack {
                DeepLinkSharedArtifactSheet(artifactId: id)
            }
        }
    }

    private func open(chatId: String) {
        chatService.selectChat(chatId)
        navigationPath = NavigationPath()
        navigationPath.append(chatId)
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
                    open(chatId: chat.id)
                } label: {
                    Label("New Chat", systemImage: "plus.circle.fill")
                }
            }

            Section("Conversations") {
                ForEach(visibleChats) { chat in
                    Button {
                        open(chatId: chat.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(chat.displayTitle)
                                .lineLimit(1)
                                .fontWeight(chat.id == chatService.currentChatId ? .semibold : .regular)
                            if let date = chat.lastUpdate {
                                Text(date.formatted(.relative(presentation: .named)))
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
                    .contextMenu {
                        Menu {
                            Button {
                                chatService.assignChat(chat.id, toProject: nil)
                            } label: {
                                if chat.projectId == nil {
                                    Label("None", systemImage: "checkmark")
                                } else {
                                    Text("None")
                                }
                            }
                            if !projectService.sortedProjects.isEmpty {
                                Divider()
                                ForEach(projectService.sortedProjects) { project in
                                    Button {
                                        chatService.assignChat(chat.id, toProject: project.id)
                                    } label: {
                                        if chat.projectId == project.id {
                                            Label(project.name, systemImage: "checkmark")
                                        } else {
                                            Text(project.name)
                                        }
                                    }
                                }
                            }
                        } label: {
                            Label("Move to Project", systemImage: "folder")
                        }

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
                    Label("Shared Chats", systemImage: "person.2")
                }

                NavigationLink {
                    SharedArtifactsListView()
                } label: {
                    Label("Shared Artifacts", systemImage: "doc.text")
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

struct DeepLinkSharedArtifactSheet: View {
    let artifactId: String
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var sharedArtifact: SharedArtifact?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading shared artifact...")
            } else if let sharedArtifact {
                SharedArtifactDetailView(sharedArtifact: sharedArtifact)
            } else if let error {
                ContentUnavailableView(
                    "Could not load artifact",
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
            await loadArtifact()
        }
    }

    private func loadArtifact() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let artifact: SharedArtifact = try await appState.chatService.apiClient.get("/share/artifact/\(artifactId)")
            sharedArtifact = artifact
        } catch {
            self.error = error.localizedDescription
        }
    }
}
