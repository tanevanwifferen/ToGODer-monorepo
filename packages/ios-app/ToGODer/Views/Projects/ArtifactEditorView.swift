import SwiftUI

struct ArtifactEditorView: View {
    let artifactId: String

    @EnvironmentObject var artifactService: ArtifactService
    @State private var editedName: String = ""
    @State private var editedContent: String = ""
    @State private var hasChanges = false
    @State private var showingDeleteConfirmation = false
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
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(!hasChanges)
                }
            }
            .onAppear {
                editedName = artifact.name
                editedContent = artifact.content ?? ""
                hasChanges = false
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
