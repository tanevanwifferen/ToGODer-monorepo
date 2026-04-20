import Foundation
import Combine

@MainActor
final class ProjectService: ObservableObject {
    @Published var projects: [String: Project] = [:]
    @Published var selectedProjectId: String?

    private let storage: StorageService
    private let chatService: ChatService

    init(storage: StorageService, chatService: ChatService) {
        self.storage = storage
        self.chatService = chatService
        self.projects = storage.loadProjects()
    }

    // MARK: - Computed

    var sortedProjects: [Project] {
        projects.values
            .filter { $0.deleted != true }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    var chatsForSelectedProject: [Chat] {
        guard let projectId = selectedProjectId else {
            return chatService.sortedChats
        }
        return chatService.sortedChats.filter { $0.projectId == projectId }
    }

    func chatCount(for projectId: String) -> Int {
        chatService.chats.values
            .filter { $0.deleted != true && $0.projectId == projectId }
            .count
    }

    // MARK: - Project Management

    @discardableResult
    func createProject(name: String, description: String? = nil) -> Project {
        let project = Project(name: name, description: description)
        projects[project.id] = project
        save()
        return project
    }

    func updateProject(id: String, name: String, description: String?) {
        guard var project = projects[id] else { return }
        project.name = name
        project.description = description
        project.updatedAt = Date()
        projects[id] = project
        save()
    }

    func deleteProject(id: String) {
        projects[id]?.deleted = true
        projects[id]?.deletedAt = Date()
        if selectedProjectId == id {
            selectedProjectId = nil
        }
        save()
    }

    func selectProject(id: String?) {
        selectedProjectId = id
    }

    func clearFilter() {
        selectedProjectId = nil
    }

    // MARK: - Persistence

    private func save() {
        storage.saveProjects(projects)
    }
}
