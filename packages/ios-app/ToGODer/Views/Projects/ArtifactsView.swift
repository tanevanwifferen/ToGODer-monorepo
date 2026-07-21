import SwiftUI

struct ArtifactsView: View {
    let projectId: String
    var parentId: String? = nil

    @EnvironmentObject var artifactService: ArtifactService
    @EnvironmentObject var chatService: ChatService
    @EnvironmentObject var authService: AuthService
    @State private var showingNewFolder = false
    @State private var showingNewFile = false
    @State private var newItemName = ""
    @State private var artifactToDelete: Artifact?
    @State private var artifactToShare: Artifact?
    @State private var artifactToPayload: Artifact?
    @State private var folderToShare: Artifact?
    @State private var folderToPayload: Artifact?

    private var items: [Artifact] {
        artifactService.childrenOf(parentId, projectId: projectId)
    }

    private var navigationTitle: String {
        if let parentId, let parent = artifactService.artifacts[parentId] {
            return parent.name
        }
        return "Artifacts"
    }

    var body: some View {
        List {
            ForEach(items) { artifact in
                if artifact.type == .folder {
                    NavigationLink {
                        ArtifactsView(projectId: projectId, parentId: artifact.id)
                            .environmentObject(artifactService)
                    } label: {
                        Label(artifact.name, systemImage: "folder.fill")
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            artifactToDelete = artifact
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .contextMenu {
                        Button {
                            folderToShare = artifact
                        } label: {
                            Label("Share Folder", systemImage: "square.and.arrow.up")
                        }
                        if authService.isAdmin {
                            Button {
                                folderToPayload = artifact
                            } label: {
                                Label("Publish to Payload", systemImage: "paperplane")
                            }
                        }
                        Button(role: .destructive) {
                            artifactToDelete = artifact
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                } else {
                    NavigationLink {
                        ArtifactEditorView(artifactId: artifact.id)
                            .environmentObject(artifactService)
                    } label: {
                        Label(artifact.name, systemImage: "doc.text")
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            artifactToDelete = artifact
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .contextMenu {
                        Button {
                            artifactToShare = artifact
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        if authService.isAdmin {
                            Button {
                                artifactToPayload = artifact
                            } label: {
                                Label("Publish to Payload", systemImage: "paperplane")
                            }
                        }
                        Button(role: .destructive) {
                            artifactToDelete = artifact
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .overlay {
            if items.isEmpty {
                ContentUnavailableView(
                    "No Artifacts",
                    systemImage: "doc.text",
                    description: Text("Add files or folders to this project.")
                )
            }
        }
        .navigationTitle(navigationTitle)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    newItemName = ""
                    showingNewFolder = true
                } label: {
                    Label("New Folder", systemImage: "folder.badge.plus")
                }

                Button {
                    newItemName = ""
                    showingNewFile = true
                } label: {
                    Label("New File", systemImage: "doc.badge.plus")
                }
            }
        }
        .alert("New Folder", isPresented: $showingNewFolder) {
            TextField("Folder name", text: $newItemName)
            Button("Create") {
                let name = newItemName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                artifactService.createFolder(name: name, projectId: projectId, parentId: parentId)
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("New File", isPresented: $showingNewFile) {
            TextField("File name", text: $newItemName)
            Button("Create") {
                let name = newItemName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                artifactService.createFile(name: name, projectId: projectId, parentId: parentId)
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert(
            "Delete \"\(artifactToDelete?.name ?? "")\"?",
            isPresented: Binding(
                get: { artifactToDelete != nil },
                set: { if !$0 { artifactToDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let artifact = artifactToDelete {
                    artifactService.delete(id: artifact.id)
                }
                artifactToDelete = nil
            }
            Button("Cancel", role: .cancel) {
                artifactToDelete = nil
            }
        } message: {
            if artifactToDelete?.type == .folder {
                Text("This will also delete all contents inside the folder.")
            } else {
                Text("This action cannot be undone.")
            }
        }
        .sheet(item: $artifactToShare) { artifact in
            ShareArtifactView(
                artifactName: artifact.name,
                artifactContent: artifact.content ?? "",
                apiClient: chatService.apiClient
            )
        }
        .sheet(item: $folderToShare) { folder in
            ShareFolderView(
                folderName: folder.name,
                folderId: folder.id,
                projectId: projectId,
                artifactService: artifactService,
                apiClient: chatService.apiClient
            )
        }
        .sheet(item: $artifactToPayload) { artifact in
            PayloadPublishView(
                contentType: .artifact,
                contentId: artifact.id,
                contentTitle: artifact.name,
                apiClient: chatService.apiClient
            )
        }
        .sheet(item: $folderToPayload) { folder in
            PayloadPublishView(
                contentType: .folder,
                contentId: folder.id,
                contentTitle: folder.name,
                apiClient: chatService.apiClient
            )
        }
    }
}
