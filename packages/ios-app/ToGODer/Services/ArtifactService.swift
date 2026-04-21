import Foundation
import Combine

@MainActor
final class ArtifactService: ObservableObject {
    @Published var artifacts: [String: Artifact] = [:]

    private let storage: StorageService

    init(storage: StorageService) {
        self.storage = storage
        self.artifacts = storage.loadArtifacts()
    }

    // MARK: - Queries

    func artifactsForProject(_ projectId: String) -> [Artifact] {
        artifacts.values
            .filter { $0.projectId == projectId && $0.deleted != true }
            .sorted { lhs, rhs in
                if lhs.type != rhs.type {
                    return lhs.type == .folder
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    func childrenOf(_ parentId: String?, projectId: String) -> [Artifact] {
        artifacts.values
            .filter { $0.projectId == projectId && $0.parentId == parentId && $0.deleted != true }
            .sorted { lhs, rhs in
                if lhs.type != rhs.type {
                    return lhs.type == .folder
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    // MARK: - Create

    @discardableResult
    func createFolder(name: String, projectId: String, parentId: String? = nil) -> Artifact {
        let artifact = Artifact(
            projectId: projectId,
            name: name,
            type: .folder,
            parentId: parentId
        )
        artifacts[artifact.id] = artifact
        save()
        return artifact
    }

    @discardableResult
    func createFile(name: String, projectId: String, parentId: String? = nil, content: String? = nil, mimeType: String? = nil) -> Artifact {
        let artifact = Artifact(
            projectId: projectId,
            name: name,
            type: .file,
            parentId: parentId,
            content: content,
            mimeType: mimeType
        )
        artifacts[artifact.id] = artifact
        save()
        return artifact
    }

    // MARK: - Update

    func updateContent(id: String, content: String) {
        guard var artifact = artifacts[id] else { return }
        artifact.content = content
        artifact.updatedAt = Date()
        artifacts[id] = artifact
        save()
    }

    func rename(id: String, name: String) {
        guard var artifact = artifacts[id] else { return }
        artifact.name = name
        artifact.updatedAt = Date()
        artifacts[id] = artifact
        save()
    }

    func move(id: String, toParent parentId: String?) {
        guard var artifact = artifacts[id] else { return }
        artifact.parentId = parentId
        artifact.updatedAt = Date()
        artifacts[id] = artifact
        save()
    }

    // MARK: - Delete

    func delete(id: String) {
        guard var artifact = artifacts[id] else { return }
        artifact.deleted = true
        artifact.deletedAt = Date()
        artifacts[id] = artifact

        // Recursively delete children if folder
        if artifact.type == .folder {
            let children = artifacts.values.filter { $0.parentId == id && $0.deleted != true }
            for child in children {
                delete(id: child.id)
            }
        }

        save()
    }

    // MARK: - Path Building

    func buildPath(for artifactId: String) -> String {
        var components: [String] = []
        var currentId: String? = artifactId

        while let id = currentId, let artifact = artifacts[id] {
            components.insert(artifact.name, at: 0)
            currentId = artifact.parentId
        }

        return components.joined(separator: "/")
    }

    // MARK: - Artifact Index

    func artifactIndex(for projectId: String) -> [ArtifactIndexItem] {
        artifacts.values
            .filter { $0.projectId == projectId && $0.type == .file && $0.deleted != true }
            .map { artifact in
                ArtifactIndexItem(
                    path: buildPath(for: artifact.id),
                    mimeType: artifact.mimeType
                )
            }
            .sorted { $0.path < $1.path }
    }

    // MARK: - Write Artifact (from tool calls)

    /// Creates or updates an artifact at the given path within a project.
    /// Automatically creates intermediate folders as needed.
    @discardableResult
    func writeArtifact(path: String, content: String, projectId: String) -> Artifact {
        let components = path.split(separator: "/").map(String.init)
        guard !components.isEmpty else {
            return createFile(name: path, projectId: projectId, content: content)
        }

        // Create intermediate folders
        var currentParentId: String? = nil
        for folderName in components.dropLast() {
            let existing = artifacts.values.first {
                $0.projectId == projectId
                && $0.parentId == currentParentId
                && $0.name == folderName
                && $0.type == .folder
                && $0.deleted != true
            }
            if let existing {
                currentParentId = existing.id
            } else {
                let folder = createFolder(name: folderName, projectId: projectId, parentId: currentParentId)
                currentParentId = folder.id
            }
        }

        let fileName = components.last!

        // Check if file already exists at this location
        if let existing = artifacts.values.first(where: {
            $0.projectId == projectId
            && $0.parentId == currentParentId
            && $0.name == fileName
            && $0.type == .file
            && $0.deleted != true
        }) {
            updateContent(id: existing.id, content: content)
            return artifacts[existing.id]!
        }

        // Guess mime type from extension
        let mimeType = Self.guessMimeType(for: fileName)

        return createFile(
            name: fileName,
            projectId: projectId,
            parentId: currentParentId,
            content: content,
            mimeType: mimeType
        )
    }

    // MARK: - Persistence

    private func save() {
        storage.saveArtifacts(artifacts)
    }

    // MARK: - Helpers

    private static func guessMimeType(for filename: String) -> String? {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "txt": return "text/plain"
        case "md": return "text/markdown"
        case "json": return "application/json"
        case "js": return "application/javascript"
        case "ts": return "application/typescript"
        case "html", "htm": return "text/html"
        case "css": return "text/css"
        case "swift": return "text/x-swift"
        case "py": return "text/x-python"
        case "rs": return "text/x-rust"
        case "go": return "text/x-go"
        case "xml": return "text/xml"
        case "yaml", "yml": return "text/yaml"
        case "csv": return "text/csv"
        default: return nil
        }
    }
}
