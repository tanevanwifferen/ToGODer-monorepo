import Foundation
import EventKit

@MainActor
final class CalendarService: ObservableObject {
    @Published var isAuthorized = false
    @Published var calendarSummary: String?

    private let eventStore = EKEventStore()
    private var lastFetch: Date?
    private let cacheInterval: TimeInterval = 3600

    // MARK: - Authorization

    func requestAccess() async {
        do {
            let granted = try await eventStore.requestFullAccessToEvents()
            isAuthorized = granted
            if granted {
                await fetchEvents()
            }
        } catch {
            isAuthorized = false
        }
    }

    // MARK: - Fetching

    func fetchEvents() async {
        guard isAuthorized else { return }

        if let lastFetch, Date().timeIntervalSince(lastFetch) < cacheInterval {
            return
        }

        let now = Date()
        let calendar = Calendar.current
        let oneWeekAgo = calendar.date(byAdding: .weekOfYear, value: -1, to: now)!
        let oneWeekAhead = calendar.date(byAdding: .weekOfYear, value: 1, to: now)!

        let pastPredicate = eventStore.predicateForEvents(
            withStart: oneWeekAgo,
            end: now,
            calendars: nil
        )
        let futurePredicate = eventStore.predicateForEvents(
            withStart: now,
            end: oneWeekAhead,
            calendars: nil
        )

        let pastEvents = eventStore.events(matching: pastPredicate)
        let futureEvents = eventStore.events(matching: futurePredicate)

        calendarSummary = formatSummary(past: pastEvents, upcoming: futureEvents)
        lastFetch = Date()
    }

    // MARK: - Formatting

    private func formatSummary(past: [EKEvent], upcoming: [EKEvent]) -> String? {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short

        func formatEvents(_ events: [EKEvent]) -> String {
            if events.isEmpty { return "none" }
            return events.map { event in
                let date = formatter.string(from: event.startDate)
                return "\(event.title ?? "Untitled") (\(date))"
            }.joined(separator: ", ")
        }

        let pastStr = formatEvents(past)
        let upcomingStr = formatEvents(upcoming)

        return "Past week: \(pastStr). Upcoming: \(upcomingStr)."
    }

    /// Invalidate cache so next fetchEvents() will re-query
    func invalidateCache() {
        lastFetch = nil
    }
}
