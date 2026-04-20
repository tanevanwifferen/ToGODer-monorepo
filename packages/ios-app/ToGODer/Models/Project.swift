import Foundation

struct Project: Identifiable, Codable {
    let id: String
    var name: String
    var description: String?
    var createdAt: Date
    var updatedAt: Date
    var deleted: Bool?
    var deletedAt: Date?

    init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
