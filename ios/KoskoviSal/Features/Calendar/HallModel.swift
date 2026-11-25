import Foundation
import Observation

// One line of a day in the hall: a booking, a cancelled training or free time.
enum DayItem: Identifiable, Hashable {
    case booking(Booking)
    case cancelled(CancellationNotice)
    case free(start: String, end: String)

    var id: String {
        switch self {
        case .booking(let booking): return booking.id
        case .cancelled(let notice): return "cancelled-\(notice.id)"
        case .free(let start, let end): return "free-\(start)-\(end)"
        }
    }

    var start: String {
        switch self {
        case .booking(let booking): return booking.start
        case .cancelled(let notice): return notice.start
        case .free(let start, _): return start
        }
    }
}

@MainActor
@Observable
final class HallModel {
    private(set) var bookings: [Booking] = []
    private(set) var cancellations: [CancellationNotice] = []
    private(set) var openingHours: [OpeningHours] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await API.get("/api/availability", as: AvailabilityResponse.self)
            bookings = response.bookings
            cancellations = response.recurringCancellations ?? []
            openingHours = response.hall?.openingHours ?? []
            error = nil
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func bookings(on day: String) -> [Booking] {
        bookings.filter { $0.date == day }.sorted { $0.start < $1.start }
    }

    func hours(on day: String) -> OpeningHours? {
        openingHours.first { $0.day == Dates.jsWeekday(day) }
    }

    // The day as the web shows it: bookings, cancelled trainings, and the
    // free time between them within the opening hours.
    func items(on day: String) -> [DayItem] {
        let dayBookings = bookings(on: day)
        var items = dayBookings.map(DayItem.booking)
        items += cancellations.filter { $0.date == day }.map(DayItem.cancelled)

        if let hours = hours(on: day) {
            var cursor = Dates.minutes(hours.start)
            let close = Dates.minutes(hours.end)
            let now = day == Dates.todayKey() ? Dates.minutes(Dates.nowTime()) : 0

            for booking in dayBookings {
                let start = Dates.minutes(booking.start)
                if start > cursor, cursor < close {
                    appendFree(&items, from: max(cursor, now), to: min(start, close))
                }
                cursor = max(cursor, Dates.minutes(booking.end))
            }

            if cursor < close {
                appendFree(&items, from: max(cursor, now), to: close)
            }
        }

        return items.sorted { $0.start < $1.start }
    }

    private func appendFree(_ items: inout [DayItem], from start: Int, to end: Int) {
        // Short gaps are not worth showing.
        if end - start >= 30 {
            items.append(.free(start: Dates.time(start), end: Dates.time(end)))
        }
    }

    func addBooking(name: String, date: String, start: String, end: String, eventType: String, note: String, cleanup: Bool) async throws {
        _ = try await API.send(
            "POST",
            "/api/booking-request",
            body: [
                "bookingKind": "hall",
                "cleanupRequired": cleanup,
                "date": date,
                "end": end,
                "eventType": eventType,
                "name": name,
                "note": note,
                "start": start,
            ],
            as: Empty.self
        )
        await load()
    }

    func delete(_ booking: Booking) async throws {
        _ = try await API.send("DELETE", "/api/bookings/\(API.segment(booking.id))", as: Empty.self)
        await load()
    }
}
