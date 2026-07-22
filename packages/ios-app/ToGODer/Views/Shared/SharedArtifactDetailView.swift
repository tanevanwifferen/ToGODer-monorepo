import SwiftUI

/// Read-only viewer for a shared artifact, with import and delete actions.
struct SharedArtifactDetailView: View {
    let sharedArtifact: SharedArtifact
    var onDeleted: (() -> Void)?

    @EnvironmentObject var appState: AppState
    @EnvironmentObject var artifactService: ArtifactService
    @Environment(\.dismiss) private var dismiss
    @State private var isDeleting = false
    @State private var showDeleteConfirm = false
    @State private var actionError: String?
    @State private var showImportedConfirmation = false

    private var isOwner: Bool {
        appState.currentUserId == sharedArtifact.ownerId
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Content
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        if let views = sharedArtifact.views {
                            Label("\(views) views", systemImage: "eye")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(sharedArtifact.createdAt)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Divider()

                    Text(sharedArtifact.content)
                        .font(.body.monospaced())
                        .textSelection(.enabled)
                }
                .padding()
                .background(.background)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
            }
            .padding()
        }
        .navigationTitle(sharedArtifact.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        importToProject()
                    } label: {
                        Label("Import to Project", systemImage: "square.and.arrow.down")
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
            "Are you sure you want to delete this shared artifact? This action cannot be undone.",
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
        .alert("Artifact imported", isPresented: $showImportedConfirmation) {
            Button("OK") { }
        } message: {
            Text("The artifact has been imported to your project.")
        }
    }

    private func importToProject() {
        guard let projectId = appState.projectService.sortedProjects.first?.id else { return }
        artifactService.createFile(
            name: sharedArtifact.title,
            projectId: projectId,
            content: sharedArtifact.content
        )
        showImportedConfirmation = true
    }

    private func deleteShare() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await appState.chatService.apiClient.delete("/share/artifact/\(sharedArtifact.id)")
            onDeleted?()
            dismiss()
        } catch {
            actionError = error.localizedDescription
        }
    }
}
