import Foundation
import HealthKit

@MainActor
final class HealthService: ObservableObject {
    @Published var isAuthorized = false
    @Published var healthSummary: String?

    private let healthStore: HKHealthStore?
    private var lastFetchTime: Date?
    private let cacheDuration: TimeInterval = 3600 // 1 hour

    init() {
        if HKHealthStore.isHealthDataAvailable() {
            self.healthStore = HKHealthStore()
        } else {
            self.healthStore = nil
        }
    }

    var isAvailable: Bool {
        healthStore != nil
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        guard let healthStore else { return }

        let typesToRead: Set<HKObjectType> = [
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.appleExerciseTime),
            HKQuantityType(.distanceWalkingRunning),
            HKCategoryType(.sleepAnalysis),
        ]

        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            isAuthorized = true
        } catch {
            isAuthorized = false
        }
    }

    // MARK: - Data Fetching

    func fetchHealthData() async {
        guard isAuthorized, healthStore != nil else { return }

        if let lastFetch = lastFetchTime, Date().timeIntervalSince(lastFetch) < cacheDuration,
           healthSummary != nil {
            return
        }

        async let exerciseWeekly = fetchExerciseMinutes(days: 7)
        async let exerciseMonthly = fetchExerciseMinutes(days: 30)
        async let sleepWeekly = fetchSleepData(days: 7)
        async let sleepMonthly = fetchSleepData(days: 30)

        let weeklyMinutes = await exerciseWeekly
        let monthlyMinutes = await exerciseMonthly
        let weeklySleep = await sleepWeekly
        let monthlySleep = await sleepMonthly

        healthSummary = buildSummary(
            weeklyExercise: weeklyMinutes,
            monthlyExercise: monthlyMinutes,
            weeklySleep: weeklySleep,
            monthlySleep: monthlySleep
        )
        lastFetchTime = Date()
    }

    func getSummary() -> String? {
        healthSummary
    }

    // MARK: - Exercise Queries

    private func fetchExerciseMinutes(days: Int) async -> Double {
        guard let healthStore else { return 0 }

        let exerciseType = HKQuantityType(.appleExerciseTime)
        let now = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: now)!

        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(
                withStart: startDate,
                end: now,
                options: .strictStartDate
            )

            let query = HKStatisticsQuery(
                quantityType: exerciseType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, result, _ in
                let minutes = result?.sumQuantity()?.doubleValue(for: .minute()) ?? 0
                continuation.resume(returning: minutes)
            }

            healthStore.execute(query)
        }
    }

    // MARK: - Sleep Queries

    private struct SleepStats {
        var averageHoursInBed: Double
        var averageBedtime: String
        var averageWakeTime: String
    }

    private func fetchSleepData(days: Int) async -> SleepStats {
        guard let healthStore else {
            return SleepStats(averageHoursInBed: 0, averageBedtime: "00:00", averageWakeTime: "00:00")
        }

        let sleepType = HKCategoryType(.sleepAnalysis)
        let now = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: now)!

        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(
                withStart: startDate,
                end: now,
                options: .strictStartDate
            )

            let sortDescriptor = NSSortDescriptor(
                key: HKSampleSortIdentifierStartDate,
                ascending: true
            )

            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, _ in
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: SleepStats(
                        averageHoursInBed: 0,
                        averageBedtime: "00:00",
                        averageWakeTime: "00:00"
                    ))
                    return
                }

                // Group sleep samples into sessions (gap > 4 hours = new session)
                let fourHours: TimeInterval = 4 * 60 * 60
                var sessions: [[HKCategorySample]] = []
                var currentSession: [HKCategorySample] = []

                for (index, sample) in samples.enumerated() {
                    if index == 0 || sample.startDate.timeIntervalSince(samples[index - 1].endDate) > fourHours {
                        if !currentSession.isEmpty {
                            sessions.append(currentSession)
                        }
                        currentSession = [sample]
                    } else {
                        currentSession.append(sample)
                    }
                }
                if !currentSession.isEmpty {
                    sessions.append(currentSession)
                }

                var totalMinutes: Double = 0
                var bedtimeAngles: [(sin: Double, cos: Double)] = []
                var wakeTimeAngles: [(sin: Double, cos: Double)] = []
                var sessionCount = 0

                let calendar = Calendar.current

                for session in sessions {
                    guard let first = session.first, let last = session.last else { continue }

                    let sessionMinutes = session.reduce(0.0) { total, s in
                        total + s.endDate.timeIntervalSince(s.startDate) / 60.0
                    }

                    if sessionMinutes < 60 { continue } // Skip very short sessions

                    totalMinutes += sessionMinutes
                    sessionCount += 1

                    // Bedtime angle (circular mean)
                    let bedComponents = calendar.dateComponents([.hour, .minute], from: first.startDate)
                    let bedHours = Double(bedComponents.hour ?? 0) + Double(bedComponents.minute ?? 0) / 60.0
                    let bedAngle = bedHours * 2.0 * .pi / 24.0
                    bedtimeAngles.append((sin: sin(bedAngle), cos: cos(bedAngle)))

                    // Wake time angle
                    let wakeComponents = calendar.dateComponents([.hour, .minute], from: last.endDate)
                    let wakeHours = Double(wakeComponents.hour ?? 0) + Double(wakeComponents.minute ?? 0) / 60.0
                    let wakeAngle = wakeHours * 2.0 * .pi / 24.0
                    wakeTimeAngles.append((sin: sin(wakeAngle), cos: cos(wakeAngle)))
                }

                let avgHours = sessionCount > 0 ? totalMinutes / Double(sessionCount) / 60.0 : 0
                let avgBedtime = Self.circularMeanTime(from: bedtimeAngles)
                let avgWakeTime = Self.circularMeanTime(from: wakeTimeAngles)

                continuation.resume(returning: SleepStats(
                    averageHoursInBed: avgHours,
                    averageBedtime: avgBedtime,
                    averageWakeTime: avgWakeTime
                ))
            }

            healthStore.execute(query)
        }
    }

    // MARK: - Helpers

    private static func circularMeanTime(from angles: [(sin: Double, cos: Double)]) -> String {
        guard !angles.isEmpty else { return "00:00" }

        let avgSin = angles.map(\.sin).reduce(0, +) / Double(angles.count)
        let avgCos = angles.map(\.cos).reduce(0, +) / Double(angles.count)

        var meanAngle = atan2(avgSin, avgCos)
        if meanAngle < 0 { meanAngle += 2.0 * .pi }

        let meanHours = meanAngle * 24.0 / (2.0 * .pi)
        let hours = Int(meanHours)
        let minutes = Int((meanHours - Double(hours)) * 60)

        return String(format: "%02d:%02d", hours, minutes)
    }

    private func buildSummary(
        weeklyExercise: Double,
        monthlyExercise: Double,
        weeklySleep: SleepStats,
        monthlySleep: SleepStats
    ) -> String? {
        var parts: [String] = []

        let weeklyAvg = weeklyExercise / 7.0
        let monthlyAvg = monthlyExercise / 30.0

        if weeklyAvg > 0 {
            parts.append(String(format: "Exercised average per day this week: %.0f, this month: %.0f minutes.", weeklyAvg, monthlyAvg))
        }

        if weeklySleep.averageHoursInBed > 0 && monthlySleep.averageHoursInBed > 0 {
            parts.append("""
            Sleep stats:
            Weekly: \(Int(round(weeklySleep.averageHoursInBed))) hours in bed, typically at \(weeklySleep.averageBedtime)
            Monthly: \(Int(round(monthlySleep.averageHoursInBed))) hours in bed, typically at \(monthlySleep.averageBedtime)
            """)
        }

        return parts.isEmpty ? nil : parts.joined(separator: "\n\n")
    }
}
