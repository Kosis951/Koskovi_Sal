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

// "Can I use the hall right now?" – as the banner on the web says it.
struct HallStatus {
    enum Tone { case free, busy, cleanup, closed }

    let title: String
    let detail: String
    let tone: Tone
    var cleanupBooking: Booking?
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

    // Minutes before closing reserved for leaving the hall (as on the web).
    static let departureMinutes = 30
    // Shorter gaps do not count as free time.
    static let minimumFreeMinutes = 45

    func load() async {
        if Demo.isOn {
            let response = Demo.availability
            bookings = response.bookings
            cancellations = response.recurringCancellations ?? []
            openingHours = response.hall?.openingHours ?? []
            hasLoaded = true
            return
        }

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

    // Free time between bookings within the opening hours (past time today
    // left out).
    func freeWindows(on day: String, from now: Int = 0) -> [(start: Int, end: Int)] {
        guard let hours = hours(on: day) else { return [] }

        var windows: [(start: Int, end: Int)] = []
        var cursor = max(Dates.minutes(hours.start), now)
        let close = Dates.minutes(hours.end)

        for booking in bookings(on: day) {
            let start = Dates.minutes(booking.start)
            if start - cursor >= Self.minimumFreeMinutes, cursor < close {
                windows.append((cursor, min(start, close)))
            }
            cursor = max(cursor, Dates.minutes(booking.end))
        }

        if close - cursor >= Self.minimumFreeMinutes {
            windows.append((cursor, close))
        }

        return windows
    }

    // The day as the web shows it: bookings, cancelled trainings and free time.
    func items(on day: String) -> [DayItem] {
        let now = day == Dates.todayKey() ? Dates.minutes(Dates.nowTime()) : 0
        var items = bookings(on: day).map(DayItem.booking)
        items += cancellations.filter { $0.date == day }.map(DayItem.cancelled)
        items += freeWindows(on: day, from: now).map { DayItem.free(start: Dates.time($0.start), end: Dates.time($0.end)) }
        return items.sorted { $0.start < $1.start }
    }

    func freeHours(on day: String) -> Double {
        let now = day == Dates.todayKey() ? Dates.minutes(Dates.nowTime()) : 0
        let minutes = freeWindows(on: day, from: now).reduce(0) { $0 + $1.end - $1.start }
        return (Double(minutes) / 30).rounded() / 2
    }

    func status(now: Date = Date()) -> HallStatus {
        let today = Dates.key(now)
        let nowMinutes = Dates.minutes(Dates.nowTime())

        guard let hours = hours(on: today) else {
            return HallStatus(title: "Sál je dnes zavřený", detail: "Dnes je sál zavřený.", tone: .closed)
        }

        let open = Dates.minutes(hours.start)
        let close = Dates.minutes(hours.end)

        if nowMinutes < open {
            return HallStatus(title: "Sál je zatím zavřený", detail: "Otevírá se dnes v \(hours.start).", tone: .closed)
        }

        if nowMinutes >= close {
            return HallStatus(title: "Sál je už zavřený", detail: "Dnes bylo otevřeno do \(hours.end).", tone: .closed)
        }

        let dayBookings = bookings(on: today)
        let windows = freeWindows(on: today, from: nowMinutes)
        let freeLater = windows.first.map { "Volno od \(Dates.time(max($0.start, nowMinutes)))." } ?? "Dnes už volno nebude."
        let current = dayBookings.first { Dates.minutes($0.start) <= nowMinutes && Dates.minutes($0.end) > nowMinutes }

        if current == nil, let waiting = dayBookings.last(where: { $0.waitsForCleanup && Dates.minutes($0.end) <= nowMinutes }) {
            return HallStatus(
                title: "Sál čeká na úklid",
                detail: "Po akci \(waiting.title) je potřeba sál uklidit.",
                tone: .cleanup,
                cleanupBooking: waiting
            )
        }

        if let current {
            return HallStatus(title: "Teď obsazeno: \(current.title) do \(current.end)", detail: freeLater, tone: .busy)
        }

        if nowMinutes >= close - Self.departureMinutes {
            return HallStatus(
                title: "Sál se zavírá",
                detail: "Posledních \(Self.departureMinutes) minut před zavíračkou (\(hours.end)) je na odchod ze sálu.",
                tone: .closed
            )
        }

        let next = dayBookings.first { Dates.minutes($0.start) > nowMinutes }

        if let window = windows.first, window.start <= nowMinutes {
            if let next, Dates.minutes(next.start) < close - Self.departureMinutes {
                return HallStatus(
                    title: "Sál je teď volný do \(next.start)",
                    detail: "Pak \(next.title) (\(next.start)–\(next.end)).",
                    tone: .free
                )
            }
            return HallStatus(title: "Sál je teď volný až do konce dne", detail: "Otevřeno do \(hours.end).", tone: .free)
        }

        if let next {
            return HallStatus(title: "Teď je jen krátká mezera", detail: "Pak \(next.title) od \(next.start). \(freeLater)", tone: .busy)
        }

        return HallStatus(title: "Sál je volný", detail: "Otevřeno do \(hours.end).", tone: .free)
    }

    // --- Changes ---

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

    func rename(_ booking: Booking, to title: String) async throws {
        _ = try await API.send("PUT", "/api/bookings/\(API.segment(booking.id))/title", body: ["title": title], as: Empty.self)
        await load()
    }

    func move(_ booking: Booking, start: String, end: String) async throws {
        _ = try await API.send(
            "PUT",
            "/api/bookings/\(API.segment(booking.id))/time",
            body: ["end": end, "start": start],
            as: Empty.self
        )
        await load()
    }

    func markCleaned(_ booking: Booking) async throws -> String {
        let response = try await API.send("POST", "/api/bookings/\(API.segment(booking.id))/clean", as: MessageResponse.self)
        await load()
        return response.message ?? "Díky! Sál je označen jako uklizený."
    }

    func reinstate(_ notice: CancellationNotice) async throws {
        _ = try await API.send("POST", "/api/bookings/\(API.segment(notice.id))/reinstate", as: Empty.self)
        await load()
    }
}
