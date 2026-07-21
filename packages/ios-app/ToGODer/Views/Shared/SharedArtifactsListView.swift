import SwiftUI

/// List view for browsing shared artifacts, with pagination.
struct SharedArtifactsListView: View {
    @EnvironmentObject var appState: AppState
    @State private var artifacts: [SharedArtifact] = []
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var error: String?
    @State private var currentPage = 1
    @State private var hasMorePages = true

    private let pageLimit = 20

    var body: some View {
        Group {
            if isLoading && artifacts.isEmpty {
                ProgressView("Loading shared artifacts...")
            } else if artifacts.isEmpty {
                ContentUnavailableView(
                    "No Shared Artifacts",
                    systemImage: "doc.text",
                    description: Text("Shared artifacts will appear here.")
                )
            } else {
                List {
                    ForEach(artifacts) { artifact in
                        NavigationLink {
                            SharedArtifactDetailView(sharedArtifact: artifact, onDeleted: {
                                Task { await refresh() }
                            })
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(artifact.title)
                                    .fontWeight(.medium)
                                if let desc = artifact.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                HStack {
                                    if let views = artifact.views {
                                        Label("\(views)", systemImage: "eye")
                                    }
                                    Text(artifact.createdAt)
                                }
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            }
                        }
                        .onAppear {
                            if artifact.id == artifacts.last?.id {
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
        .navigationTitle("Shared Artifacts")
        .task {
            await loadArtifacts()
        }
        .refreshable {
            await refresh()
        }
    }

    private func loadArtifacts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let results: [SharedArtifact] = try await appState.chatService.apiClient.get(
                "/share/artifact/list?page=\(currentPage)&limit=\(pageLimit)"
            )
            artifacts = results
            hasMorePages = results.count >= pageLimit
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func refresh() async {
        currentPage = 1
        hasMorePages = true
        await loadArtifacts()
    }

    private func loadMore() async {
        guard hasMorePages, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let nextPage = currentPage + 1
        do {
            let results: [SharedArtifact] = try await appState.chatService.apiClient.get(
                "/share/artifact/list?page=\(nextPage)&limit=\(pageLimit)"
            )
            artifacts.append(contentsOf: results)
            currentPage = nextPage
            hasMorePages = results.count >= pageLimit
        } catch {
            self.error = error.localizedDescription
        }
    }
}
