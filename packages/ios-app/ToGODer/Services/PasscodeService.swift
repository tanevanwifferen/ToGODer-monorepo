import Foundation
import Combine

@MainActor
final class PasscodeService: ObservableObject {
    @Published var isLocked: Bool

    var hasPasscode: Bool {
        storage.passcode != nil
    }

    private let storage: StorageService

    init(storage: StorageService) {
        self.storage = storage
        self.isLocked = storage.passcode != nil
    }

    func unlock(code: String) -> Bool {
        guard code == storage.passcode else { return false }
        isLocked = false
        return true
    }

    func setPasscode(_ code: String) {
        storage.passcode = code
    }

    func removePasscode() {
        storage.passcode = nil
        isLocked = false
    }

    func lock() {
        guard hasPasscode else { return }
        isLocked = true
    }
}
