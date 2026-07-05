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
                            SharedChatDetailView(sharedChat: chat, onDeleted: {
                                Task { await refresh() }
                            })
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
    /// Called after the owner deletes this share so the list can refresh.
    var onDeleted: (() -> Void)?

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [SignedMessage] = []
    @State private var isDeleting = false
    @State private var showDeleteConfirm = false
    @State private var actionError: String?
    @State private var showCopiedConfirmation = false

    private var isOwner: Bool {
        appState.currentUserId == sharedChat.ownerId
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(Array(messages.enumerated()), id: \.offset) { _, msg in
                    HStack(alignment: .top) {
                        if msg.role == "user" { Spacer(minLength: 60) }

                        MermaidMessageText(content: msg.content, isUser: msg.role == "user")

                        if msg.role != "user" { Spacer(minLength: 60) }
                    }
                }
            }
            .padding()
        }
        .navigationTitle(sharedChat.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        copyToMyChats()
                    } label: {
                        Label("Copy to My Chats", systemImage: "doc.on.doc")
                    }

                    if isOwner {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("Delete Share", systemImage: "trash")
                        }
                        .disabled(isDeleting)
                    }
                } label: {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .confirmationDialog(
            "Are you sure you want to delete this shared conversation? This action cannot be undone.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task { await deleteShare() }
            }
        }
        .alert("Error", isPresented: .constant(actionError != nil)) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
        .alert("Conversation copied to your chats", isPresented: $showCopiedConfirmation) {
            Button("OK") { }
        }
        .onAppear {
            if let data = sharedChat.messages.data(using: .utf8),
               let decoded = try? JSONDecoder().decode([SignedMessage].self, from: data) {
                messages = decoded
            }
        }
    }

    /// Creates a local chat from the shared messages, mirroring RN's
    /// handleCopy in SharedConversationView (local copy, not the backend
    /// copy endpoint).
    private func copyToMyChats() {
        let chatMessages = messages.map { msg in
            ChatMessage(
                content: msg.content,
                role: msg.role == "user" ? .user : .assistant
            )
        }
        appState.chatService.importChat(title: sharedChat.title, messages: chatMessages)
        showCopiedConfirmation = true
    }

    private func deleteShare() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await appState.chatService.apiClient.delete("/share/\(sharedChat.id)")
            onDeleted?()
            dismiss()
        } catch {
            actionError = error.localizedDescription
        }
    }
}
