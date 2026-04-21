import Foundation

@MainActor
final class BalanceService: ObservableObject {
    @Published var balance: Double = 0
    @Published var globalBalance: Double = 0
    @Published var error: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchBalance() async {
        error = nil
        do {
            let response: BillingResponse = try await apiClient.get("/billing")
            balance = response.balance ?? 0
            globalBalance = response.globalBalance ?? 0
        } catch {
            self.error = error.localizedDescription
        }
    }

    var hasBalance: Bool {
        balance > 0 || globalBalance > 0
    }
}
