import Foundation

@MainActor
final class BalanceService: ObservableObject {
    @Published var credits: Double = 0
    @Published var subscription: Subscription?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchBalance() async {
        do {
            let response: BillingResponse = try await apiClient.get("/billing")
            credits = response.credits ?? 0
            subscription = response.subscription
        } catch {
            // Non-critical
        }
    }

    var hasBalance: Bool {
        credits > 0 || (subscription?.active == true)
    }
}
