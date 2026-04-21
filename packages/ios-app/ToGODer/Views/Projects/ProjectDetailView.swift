import SwiftUI

struct ProjectDetailView: View {
    let projectId: String
    @EnvironmentObject var projectService: ProjectService
    @EnvironmentObject var chatService: ChatService
    @State private var selectedTab = 0

    private var project: Project? {
        projectService.projects[projectId]
    }

    private var projectChats: [Chat] {
        chatService.sortedChats.filter { $0.projectId == projectId }
    }

    var body: some View {
        if let project {
            TabView(selection: $selectedTab) {
                chatsTab
                    .tabItem {
                        Label("Chats", systemImage: "bubble.left.and.bubble.right")
                    }
                    .tag(0)

                ArtifactsView(projectId: projectId)
                    .tabItem {
                        Label("Artifacts", systemImage: "doc.text")
                    }
                    .tag(1)

                infoTab(project: project)
                    .tabItem {
                        Label("Info", systemImage: "info.circle")
                    }
                    .tag(2)
            }
            .navigationTitle(project.name)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView(
                "Project Not Found",
                systemImage: "folder.badge.questionmark"
            )
        }
    }

    // MARK: - Chats Tab

    private var chatsTab: some View {
        List {
            ForEach(projectChats) { chat in
                Button {
                    chatService.selectChat(chat.id)
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
            }
        }
        .overlay {
            if projectChats.isEmpty {
                ContentUnavailableView(
                    "No Chats",
                    systemImage: "bubble.left",
                    description: Text("Start a new chat in this project.")
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    let chat = chatService.createChat(projectId: projectId)
                    chatService.selectChat(chat.id)
                } label: {
                    Label("New Chat", systemImage: "plus.circle.fill")
                }
            }
        }
    }

    // MARK: - Info Tab

    private func infoTab(project: Project) -> some View {
        ProjectInfoEditView(
            projectId: projectId,
            initialName: project.name,
            initialDescription: project.description ?? ""
        )
    }
}

struct ProjectInfoEditView: View {
    let projectId: String
    @EnvironmentObject var projectService: ProjectService
    @State private var name: String
    @State private var description: String
    @State private var showingSaved = false

    init(projectId: String, initialName: String, initialDescription: String) {
        self.projectId = projectId
        self._name = State(initialValue: initialName)
        self._description = State(initialValue: initialDescription)
    }

    var body: some View {
        Form {
            Section("Project Details") {
                TextField("Name", text: $name)
                TextField("Description", text: $description, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section {
                Button("Save Changes") {
                    projectService.updateProject(
                        id: projectId,
                        name: name,
                        description: description.isEmpty ? nil : description
                    )
                    showingSaved = true
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if let project = projectService.projects[projectId] {
                Section("Details") {
                    LabeledContent("Created", value: project.createdAt, format: .dateTime)
                    LabeledContent("Updated", value: project.updatedAt, format: .dateTime)
                    LabeledContent("Chats", value: "\(projectService.chatCount(for: projectId))")
                }
            }
        }
        .alert("Saved", isPresented: $showingSaved) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Project updated successfully.")
        }
    }
}
