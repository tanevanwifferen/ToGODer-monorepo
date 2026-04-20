import SwiftUI

struct SharedConversationsView: View {
    @EnvironmentObject var appState: AppState
    @State private var sharedChats: [SharedChat] = []
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var error: String?
    @State private var currentPage = 1
    @State private var hasMorePages = true

    private let pageLimit = 20

    var body: some View {
        Group {
            if isLoading && sharedChats.isEmpty {
                ProgressView("Loading shared conversations...")
            } else if sharedChats.isEmpty {
                ContentUnavailableView(
                    "No Shared Conversations",
                    systemImage: "person.2.slash",
                    description: Text("Public conversations shared by the community will appear here.")
                )
            } else {
                List {
                    ForEach(sharedChats) { chat in
                        NavigationLink {
                            SharedChatDetailView(sharedChat: chat)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(chat.title)
                                    .fontWeight(.medium)
                                if let desc = chat.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                HStack {
                                    if let views = chat.views {
                                        Label("\(views)", systemImage: "eye")
                                    }
                                    Text(chat.createdAt)
                                }
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            }
                        }
                        .onAppear {
                            if chat.id == sharedChats.last?.id {
                                Task { await loadMore() }
                            }
                        }
                    }
                    if isLoadingMore {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .listRowSeparator(.hidden)
                    }
                }
            }
        }
        .navigationTitle("Shared")
        .task {
            await loadShared()
        }
        .refreshable {
            await refresh()
        }
    }

    private func loadShared() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let results: [SharedChat] = try await appState.chatService.apiClient.get(
                "/share?page=\(currentPage)&limit=\(pageLimit)"
            )
            sharedChats = results
            hasMorePages = results.count >= pageLimit
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func refresh() async {
        currentPage = 1
        hasMorePages = true
        await loadShared()
    }

    private func loadMore() async {
        guard hasMorePages, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let nextPage = currentPage + 1
        do {
            let results: [SharedChat] = try await appState.chatService.apiClient.get(
                "/share?page=\(nextPage)&limit=\(pageLimit)"
            )
            sharedChats.append(contentsOf: results)
            currentPage = nextPage
            hasMorePages = results.count >= pageLimit
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SharedChatDetailView: View {
    let sharedChat: SharedChat
    @State private var messages: [SignedMessage] = []

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(Array(messages.enumerated()), id: \.offset) { _, msg in
                    HStack(alignment: .top) {
                        if msg.role == "user" { Spacer(minLength: 60) }

                        Text(msg.content)
                            .textSelection(.enabled)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(msg.role == "user" ? Color.blue : Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 16))

                        if msg.role != "user" { Spacer(minLength: 60) }
                    }
                }
            }
            .padding()
        }
        .navigationTitle(sharedChat.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let data = sharedChat.messages.data(using: .utf8),
               let decoded = try? JSONDecoder().decode([SignedMessage].self, from: data) {
                messages = decoded
            }
        }
    }
}
