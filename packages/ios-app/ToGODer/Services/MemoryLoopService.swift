import Foundation

/// Periodically checks whether short-term memory has grown past a threshold
/// and, if so, triggers a "dream" (memory compression) that redistributes the
/// overflow into separate long-term key-value memories. Mirrors
/// MemoryLoopService in the React Native app.
@MainActor
final class MemoryLoopService {
    private let memoryService: MemoryService
    private let personalDataService: PersonalDataService
    private let authService: AuthService
    private let balanceService: BalanceService

    private var timer: Timer?

    /// Check every 5 minutes.
    private let interval: TimeInterval = 5 * 60

    /// Compress when short-term memory exceeds this many bytes.
    private let sizeThreshold = 2000

    init(
        memoryService: MemoryService,
        personalDataService: PersonalDataService,
        authService: AuthService,
        balanceService: BalanceService
    ) {
        self.memoryService = memoryService
        self.personalDataService = personalDataService
        self.authService = authService
        self.balanceService = balanceService
    }

    func start() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        // Immediate first check.
        Task { @MainActor in await self.tick() }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() async {
        guard authService.isAuthenticated else { return }
        guard (balanceService.balance + balanceService.globalBalance) > 0 else { return }
        guard !memoryService.isCompressing else { return }
        guard personalDataService.sizeInBytes > sizeThreshold else { return }

        await memoryService.compress(shortTermMemory: personalDataService.data)
    }
}
