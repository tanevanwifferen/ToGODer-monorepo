import SwiftUI

struct MainNavigationView: View {
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var settingsService: SettingsService
    @State private var showingSidebar = false
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
        } detail: {
            if let chatId = chatService.currentChatId,
               let _ = chatService.chats[chatId] {
                ChatView(chatId: chatId)
            } else {
                EmptyChatView()
            }
        }
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
                ForEach(chatService.sortedChats) { chat in
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
            }

            Section {
                NavigationLink {
                    SharedConversationsView()
                } label: {
                    Label("Shared", systemImage: "person.2")
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
    }
}

struct EmptyChatView: View {
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var settingsService: SettingsService
    @State private var quote: String?

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
        }
        .task {
            if let config = settingsService.globalConfig {
                quote = config.quote
            }
        }
    }
}
