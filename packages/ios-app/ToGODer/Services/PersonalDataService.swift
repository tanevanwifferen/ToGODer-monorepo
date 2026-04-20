import Foundation
import Combine

/// Holds the short-term memory (free-form text summarising the user as learned
/// from conversations). Grows as chats happen; gets compressed into long-term
/// key-value memories by MemoryLoopService when it exceeds a size threshold.
@MainActor
final class PersonalDataService: ObservableObject {
    @Published var data: String

    private let storage: StorageService

    init(storage: StorageService) {
        self.storage = storage
        self.data = storage.personalData
    }

    func set(_ newValue: String) {
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        // Treat null/empty/no-alphanumeric sentinels from the server as "no change"
        if trimmed.isEmpty
            || trimmed == "null"
            || trimmed.rangeOfCharacter(from: .letters) == nil {
            return
        }
        guard trimmed != data else { return }
        data = trimmed
        storage.personalData = trimmed
    }

    func reload() {
        data = storage.personalData
    }

    var sizeInBytes: Int {
        data.utf8.count
    }
}
