import Foundation
import Combine

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
            self.isAuthenticated = true
            self.email = storage.userEmail
            Task {
                await apiClient.setToken(token)
                startTokenRefresh(userId: userId)
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
