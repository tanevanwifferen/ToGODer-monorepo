import Foundation
import Combine
import Security

@MainActor
final class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var email: String?
    @Published var isLoading = false
    @Published var error: String?

    private let apiClient: APIClient
    private let storage: StorageService
    private(set) var password: String?
    private var refreshTask: Task<Void, Never>?

    init(apiClient: APIClient, storage: StorageService) {
        self.apiClient = apiClient
        self.storage = storage

        if let token = storage.authToken, let userId = storage.userId {
            let storedPassword = AuthKeychain.load()
            if storedPassword == nil {
                // Pre-sync-feature install: token exists but no keychain password.
                // Force re-auth so signIn populates the keychain for sync.
                storage.authToken = nil
                storage.userId = nil
                storage.userEmail = nil
            } else {
                self.isAuthenticated = true
                self.email = storage.userEmail
                self.password = storedPassword
                Task {
                    await apiClient.setToken(token)
                    startTokenRefresh(userId: userId)
                }
            }
        }
    }

    func signIn(email: String, password: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let response: SignInResponse = try await apiClient.post(
                "/auth/signIn",
                body: SignInRequest(email: email, password: password)
            )
            await apiClient.setToken(response.token)
            storage.authToken = response.token
            storage.userId = response.userId
            storage.userEmail = email
            self.email = email
            self.password = password
            AuthKeychain.save(password)
            isAuthenticated = true
            startTokenRefresh(userId: response.userId)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            try await apiClient.post(
                "/auth/signUp",
                body: SignUpRequest(email: email, password: password)
            )
            self.password = password
            AuthKeychain.save(password)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    func forgotPassword(email: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            try await apiClient.post(
                "/auth/forgotPassword/\(email)",
                body: EmptyBody()
            )
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    func changePassword(oldPassword: String, newPassword: String) async -> Bool {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            try await apiClient.post(
                "/auth/changePassword",
                body: ChangePasswordRequest(oldPassword: oldPassword, newPassword: newPassword)
            )
            self.password = newPassword
            AuthKeychain.save(newPassword)
            return true
        } catch let apiError as APIError {
            error = apiError.errorDescription
            return false
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func signOut() {
        refreshTask?.cancel()
        refreshTask = nil
        Task { await apiClient.setToken(nil) }
        storage.authToken = nil
        storage.userId = nil
        storage.userEmail = nil
        password = nil
        AuthKeychain.delete()
        email = nil
        isAuthenticated = false
    }

    // MARK: - Token Refresh

    private func startTokenRefresh(userId: String) {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Configuration.tokenRefreshInterval))
                guard !Task.isCancelled else { return }
                await self?.refreshToken(userId: userId)
            }
        }
    }

    private func refreshToken(userId: String) async {
        do {
            let response: UpdateTokenResponse = try await apiClient.post(
                "/auth/updateToken",
                body: UpdateTokenRequest(userId: userId)
            )
            await apiClient.setToken(response.token)
            storage.authToken = response.token
        } catch {
            // Try re-auth with stored credentials
            if let email = storage.userEmail, let password = self.password {
                await signIn(email: email, password: password)
            }
        }
    }
}

private struct EmptyBody: Codable {}

// MARK: - Keychain storage for sync encryption password

private enum AuthKeychain {
    private static let service = "click.togoder.ios"
    private static let account = "sync.password"

    static func save(_ password: String) {
        guard let data = password.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attrs as CFDictionary, nil)
        if status != errSecSuccess {
            print("[AuthKeychain] ERROR: save failed with status \(status)")
        }
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let password = String(data: data, encoding: .utf8) else {
            return nil
        }
        return password
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
