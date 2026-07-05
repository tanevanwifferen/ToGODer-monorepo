import Foundation
import Combine

@MainActor
final class ArtifactService: ObservableObject {
    @Published var artifacts: [String: Artifact] = [:]

    private let storage: StorageService
    weak var syncService: SyncService?

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

    /// Absolute path with a leading "/", matching the RN app's path format
    /// so the model sees identical artifact paths on every platform.
    func buildPath(for artifactId: String) -> String {
        var components: [String] = []
        var currentId: String? = artifactId

        while let id = currentId, let artifact = artifacts[id] {
            components.insert(artifact.name, at: 0)
            currentId = artifact.parentId
        }

        return "/" + components.joined(separator: "/")
    }

    /// Finds a live artifact in a project by its absolute path.
    func findByPath(_ path: String, projectId: String) -> Artifact? {
        artifactsForProject(projectId).first { buildPath(for: $0.id) == path }
    }

    /// Artifacts with a parentId pointing at a missing folder are moved to
    /// root before building an index, mirroring RN's fixOrphanedArtifacts.
    func fixOrphanedArtifacts(projectId: String) {
        let live = artifactsForProject(projectId)
        let ids = Set(live.map { $0.id })
        for artifact in live {
            if let parentId = artifact.parentId, !ids.contains(parentId) {
                move(id: artifact.id, toParent: nil)
            }
        }
    }

    // MARK: - Artifact Index

    /// Wire-compatible with RN's buildArtifactIndex: includes folders as well
    /// as files, with name and type for each entry.
    func artifactIndex(for projectId: String) -> [ArtifactIndexItem] {
        fixOrphanedArtifacts(projectId: projectId)
        return artifactsForProject(projectId)
            .map { artifact in
                ArtifactIndexItem(
                    path: buildPath(for: artifact.id),
                    name: artifact.name,
                    type: artifact.type.rawValue,
                    mimeType: artifact.type == .file ? (artifact.mimeType ?? "text/plain") : nil
                )
            }
            .sorted { $0.path < $1.path }
    }

    // MARK: - Tool Call Handling

    struct ToolCallResult {
        let message: String
        var artifactId: String?
        let isError: Bool
        let operation: ToolOperation
    }

    enum ToolOperation: String {
        case read, write, delete, move
    }

    /// Executes an artifact tool call from the AI. Port of RN
    /// MessageService.handleArtifactToolCall — behavior must stay identical
    /// so conversations are portable between platforms.
    func handleToolCall(_ toolCall: ToolCallData, projectId: String) -> ToolCallResult {
        let path = toolCall.string("path") ?? ""

        switch toolCall.name {
        case "read_artifact":
            guard let artifact = findByPath(path, projectId: projectId) else {
                return ToolCallResult(message: "Artifact not found at path \"\(path)\"", isError: true, operation: .read)
            }
            if artifact.type == .folder {
                let children = childrenOf(artifact.id, projectId: projectId)
                let listing = children
                    .map { "\($0.type == .folder ? "[folder] " : "")\($0.name)" }
                    .joined(separator: "\n")
                return ToolCallResult(
                    message: "Folder contents of \"\(path)\":\n\(listing.isEmpty ? "(empty)" : listing)",
                    artifactId: artifact.id,
                    isError: false,
                    operation: .read
                )
            }
            return ToolCallResult(message: artifact.content ?? "", artifactId: artifact.id, isError: false, operation: .read)

        case "write_artifact":
            guard let content = toolCall.string("content") else {
                return ToolCallResult(message: "Content is required", isError: true, operation: .write)
            }
            let existed = findByPath(path, projectId: projectId) != nil
            let artifact = writeArtifact(
                path: path,
                content: content,
                projectId: projectId,
                displayName: toolCall.string("name"),
                mimeType: toolCall.string("mimeType")
            )
            return ToolCallResult(
                message: "\(existed ? "Updated" : "Created") artifact \"\(path)\"",
                artifactId: artifact.id,
                isError: false,
                operation: .write
            )

        case "delete_artifact":
            guard let artifact = findByPath(path, projectId: projectId) else {
                return ToolCallResult(message: "Artifact not found at path \"\(path)\"", isError: true, operation: .delete)
            }
            delete(id: artifact.id)
            return ToolCallResult(message: "Deleted artifact \"\(path)\"", artifactId: artifact.id, isError: false, operation: .delete)

        case "move_artifact":
            guard let artifact = findByPath(path, projectId: projectId) else {
                return ToolCallResult(message: "Artifact not found at path \"\(path)\"", isError: true, operation: .move)
            }
            guard let destination = toolCall.string("destination") else {
                return ToolCallResult(message: "Destination path is required", isError: true, operation: .move)
            }

            var newParentId: String? = nil
            if destination != "/" {
                guard let destArtifact = findByPath(destination, projectId: projectId) else {
                    return ToolCallResult(message: "Destination folder not found at path \"\(destination)\"", isError: true, operation: .move)
                }
                guard destArtifact.type == .folder else {
                    return ToolCallResult(message: "Destination \"\(destination)\" is not a folder", isError: true, operation: .move)
                }
                if artifact.type == .folder,
                   destArtifact.id == artifact.id || isDescendant(destArtifact.parentId, of: artifact.id) {
                    return ToolCallResult(
                        message: "Cannot move folder \"\(path)\" into itself or its descendant",
                        isError: true,
                        operation: .move
                    )
                }
                newParentId = destArtifact.id
            }

            move(id: artifact.id, toParent: newParentId)
            return ToolCallResult(message: "Moved artifact \"\(path)\" to \"\(destination)\"", artifactId: artifact.id, isError: false, operation: .move)

        case "list_directory":
            let depth = toolCall.int("depth") ?? 1

            var targetParentId: String? = nil
            if path != "/" && !path.isEmpty {
                guard let targetFolder = findByPath(path, projectId: projectId) else {
                    return ToolCallResult(message: "Directory not found at path \"\(path)\"", isError: true, operation: .read)
                }
                guard targetFolder.type == .folder else {
                    return ToolCallResult(message: "Path \"\(path)\" is not a directory", isError: true, operation: .read)
                }
                targetParentId = targetFolder.id
            }

            let contents = listEntries(parentId: targetParentId, projectId: projectId, currentDepth: 1, maxDepth: depth)
            if contents.isEmpty {
                return ToolCallResult(message: "Directory \"\(path)\" is empty", isError: false, operation: .read)
            }
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let listing = (try? encoder.encode(contents)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
            return ToolCallResult(message: "Directory listing for \"\(path)\":\n\(listing)", isError: false, operation: .read)

        default:
            return ToolCallResult(message: "Unknown tool \"\(toolCall.name)\"", isError: true, operation: .read)
        }
    }

    private struct DirectoryEntry: Codable {
        let name: String
        let type: String
        let id: String
        let path: String
    }

    private func listEntries(parentId: String?, projectId: String, currentDepth: Int, maxDepth: Int) -> [DirectoryEntry] {
        var result: [DirectoryEntry] = []
        for child in childrenOf(parentId, projectId: projectId) {
            result.append(DirectoryEntry(
                name: child.name,
                type: child.type.rawValue,
                id: child.id,
                path: buildPath(for: child.id)
            ))
            if currentDepth < maxDepth && child.type == .folder {
                result.append(contentsOf: listEntries(parentId: child.id, projectId: projectId, currentDepth: currentDepth + 1, maxDepth: maxDepth))
            }
        }
        return result
    }

    private func isDescendant(_ parentId: String?, of targetId: String) -> Bool {
        guard let parentId else { return false }
        if parentId == targetId { return true }
        guard let parent = artifacts[parentId] else { return false }
        return isDescendant(parent.parentId, of: targetId)
    }

    // MARK: - Write Artifact (from tool calls)

    /// Creates or updates an artifact at the given path within a project.
    /// Automatically creates intermediate folders as needed.
    @discardableResult
    func writeArtifact(path: String, content: String, projectId: String, displayName: String? = nil, mimeType explicitMimeType: String? = nil) -> Artifact {
        let components = path.split(separator: "/").map(String.init)
        guard !components.isEmpty else {
            return createFile(name: displayName ?? path, projectId: projectId, content: content, mimeType: explicitMimeType)
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
            if let displayName, !displayName.isEmpty, displayName != existing.name {
                rename(id: existing.id, name: displayName)
            }
            return artifacts[existing.id]!
        }

        let mimeType = explicitMimeType ?? Self.guessMimeType(for: fileName)

        return createFile(
            name: (displayName?.isEmpty == false ? displayName! : fileName),
            projectId: projectId,
            parentId: currentParentId,
            content: content,
            mimeType: mimeType
        )
    }

    // MARK: - Persistence

    private func save() {
        storage.saveArtifacts(artifacts)
        syncService?.schedulePush()
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
