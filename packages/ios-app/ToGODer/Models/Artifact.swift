import Foundation

enum ArtifactType: String, Codable {
    case file
    case folder
}

struct Artifact: Identifiable, Codable {
    let id: String
    var projectId: String
    var name: String
    var type: ArtifactType
    var parentId: String?
    var content: String?
    var mimeType: String?
    var createdAt: Date
    var updatedAt: Date
    var deleted: Bool?
    var deletedAt: Date?

    init(
        id: String = UUID().uuidString,
        projectId: String,
        name: String,
        type: ArtifactType,
        parentId: String? = nil,
        content: String? = nil,
        mimeType: String? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.name = name
        self.type = type
        self.parentId = parentId
        self.content = content
        self.mimeType = mimeType
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
