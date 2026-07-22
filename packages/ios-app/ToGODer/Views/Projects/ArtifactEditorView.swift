import SwiftUI

struct ArtifactEditorView: View {
    let artifactId: String

    @EnvironmentObject var artifactService: ArtifactService
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var authService: AuthService
    @State private var editedName: String = ""
    @State private var editedContent: String = ""
    @State private var hasChanges = false
    @State private var showingDeleteConfirmation = false
    @State private var showingShareSheet = false
    @State private var showingPayloadPublish = false
    @Environment(\.dismiss) private var dismiss

    private var artifact: Artifact? {
        artifactService.artifacts[artifactId]
    }

    var body: some View {
        if let artifact {
            Form {
                Section("Name") {
                    TextField("File name", text: $editedName)
                        .onChange(of: editedName) { _ in hasChanges = true }
                }

                Section("Content") {
                    TextEditor(text: $editedContent)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 300)
                        .onChange(of: editedContent) { _ in hasChanges = true }
                }

                Section("Details") {
                    LabeledContent("Type", value: artifact.type.rawValue)
                    if let mimeType = artifact.mimeType {
                        LabeledContent("MIME Type", value: mimeType)
                    }
                    LabeledContent("Created", value: artifact.createdAt, format: .dateTime)
                    LabeledContent("Updated", value: artifact.updatedAt, format: .dateTime)
                    LabeledContent("Path", value: artifactService.buildPath(for: artifactId))
                }

                Section {
                    Button("Delete File", role: .destructive) {
                        showingDeleteConfirmation = true
                    }
                }
            }
            .navigationTitle(artifact.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 16) {
                        Menu {
                            Button {
                                showingShareSheet = true
                            } label: {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                            if authService.isAdmin {
                                Button {
                                    showingPayloadPublish = true
                                } label: {
                                    Label("Publish to Payload", systemImage: "paperplane")
                                }
                            }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                        }
                        Button("Save") {
                            saveChanges()
                        }
                        .disabled(!hasChanges)
                    }
                }
            }
            .onAppear {
                editedName = artifact.name
                editedContent = artifact.content ?? ""
                hasChanges = false
            }
            .sheet(isPresented: $showingShareSheet) {
                ShareArtifactView(
                    artifactName: artifact.name,
                    artifactContent: artifact.content ?? "",
                    apiClient: chatService.apiClient
                )
            }
            .sheet(isPresented: $showingPayloadPublish) {
                PayloadPublishView(
                    contentType: .artifact,
                    contentId: artifact.id,
                    contentTitle: artifact.name,
                    apiClient: chatService.apiClient
                )
            }
            .alert("Delete File?", isPresented: $showingDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    artifactService.delete(id: artifactId)
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This action cannot be undone.")
            }
        } else {
            ContentUnavailableView(
                "Artifact Not Found",
                systemImage: "doc.badge.questionmark"
            )
        }
    }

    private func saveChanges() {
        let trimmedName = editedName.trimmingCharacters(in: .whitespaces)
        if !trimmedName.isEmpty && trimmedName != artifact?.name {
            artifactService.rename(id: artifactId, name: trimmedName)
        }
        if editedContent != artifact?.content {
            artifactService.updateContent(id: artifactId, content: editedContent)
        }
        hasChanges = false
    }
}
