import SwiftUI

struct ProjectsView: View {
    @EnvironmentObject var projectService: ProjectService
    @State private var showingNewProject = false

    var body: some View {
        List {
            ForEach(projectService.sortedProjects) { project in
                NavigationLink {
                    ProjectDetailView(projectId: project.id)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.name)
                            .fontWeight(.medium)
                        if let description = project.description, !description.isEmpty {
                            Text(description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        HStack {
                            Text("\(projectService.chatCount(for: project.id)) chats")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            Spacer()
                            Text(project.createdAt, style: .date)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        projectService.deleteProject(id: project.id)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewProject = true
                } label: {
                    Label("New Project", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewProject) {
            NewProjectSheet()
        }
        .overlay {
            if projectService.sortedProjects.isEmpty {
                ContentUnavailableView(
                    "No Projects",
                    systemImage: "folder",
                    description: Text("Create a project to organize your conversations.")
                )
            }
        }
    }
}

struct NewProjectSheet: View {
    @EnvironmentObject var projectService: ProjectService
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Project Name", text: $name)
                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        projectService.createProject(
                            name: name,
                            description: description.isEmpty ? nil : description
                        )
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
