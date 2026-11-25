import Foundation

// Demo mode for App Store screenshots: started with `-demo` (and `-tab
// calendar|lessons|schedule|account`), the app shows made-up data instead of
// the server's, so no real names end up in the screenshots.
enum Demo {
    static let isOn = ProcessInfo.processInfo.arguments.contains("-demo")

    static var tab: AppTab? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-tab"), index + 1 < arguments.count else { return nil }
        switch arguments[index + 1] {
        case "lessons": return .lessons
        case "schedule": return .schedule
        case "account": return .account
        default: return .calendar
        }
    }

    static let session = SessionInfo(authenticated: true, displayName: "Tereza Nováková", role: "viewer", username: "tereza", scheduleName: "Novák")

    private static var today: String { Dates.todayKey() }

    private static func day(_ offset: Int) -> String {
        Dates.addDays(offset, to: today)
    }

    private static func booking(
        _ id: String,
        _ date: String,
        _ start: String,
        _ end: String,
        _ title: String,
        eventType: String? = nil,
        busy: Bool = false,
        trainer: String? = nil,
        note: String? = nil,
        cleanup: Bool = false
    ) -> Booking {
        Booking(
            id: id,
            title: title,
            organizer: "TK Koškovi",
            date: date,
            start: start,
            end: end,
            status: busy ? "maintenance" : "confirmed",
            eventType: eventType,
            bookingKind: "hall",
            note: note,
            trainer: trainer,
            cleanupRequired: cleanup,
            cleanedAt: nil,
            createdBy: nil
        )
    }

    static var availability: AvailabilityResponse {
        let weekStart = Dates.weekStart(today)
        let weekdays = (0..<7).map { Dates.addDays($0, to: weekStart) }
        var bookings: [Booking] = []

        for (index, date) in weekdays.enumerated() {
            switch index {
            case 0:
                bookings.append(booking("recurring-deti-\(date)", date, "15:15", "17:00", "Děti"))
                bookings.append(booking("demo-a-\(date)", date, "18:00", "20:00", "Seminář LAT", eventType: "seminar", trainer: "Jirka", note: "Rumba a cha-cha, s sebou pití."))
            case 1:
                bookings.append(booking("recurring-prvni-\(date)", date, "15:45", "16:30", "První krůčky"))
                bookings.append(booking("recurring-juniori-\(date)", date, "16:30", "17:15", "Junioři"))
                bookings.append(booking("recurring-practise-\(date)", date, "17:30", "19:30", "Practise"))
                bookings.append(booking("recurring-ladies-\(date)", date, "20:00", "21:00", "Latino Ladies"))
            case 2:
                bookings.append(booking("demo-b-\(date)", date, "10:30", "13:00", "Soustředění juniorů", eventType: "soustredeni", trainer: "Šárka"))
                bookings.append(booking("demo-c-\(date)", date, "17:00", "19:00", "Obsazeno – focení", busy: true, cleanup: true))
            case 3:
                bookings.append(booking("recurring-pohybovka-\(date)", date, "17:15", "18:00", "Pohybovka"))
                bookings.append(booking("recurring-spolecna-\(date)", date, "18:00", "19:30", "Společná LAT"))
            case 4:
                bookings.append(booking("recurring-juniori-pa-\(date)", date, "16:00", "17:00", "Junioři"))
                bookings.append(booking("demo-d-\(date)", date, "18:00", "21:00", "Taneční večer", eventType: "seminar"))
            case 5:
                bookings.append(booking("demo-e-\(date)", date, "12:00", "17:00", "Externí trenér", eventType: "seminar", trainer: "Externí"))
            default:
                break
            }
        }

        let hours = [
            OpeningHours(day: 1, label: "Pondělí", start: "10:30", end: "22:00"),
            OpeningHours(day: 2, label: "Úterý", start: "10:30", end: "22:00"),
            OpeningHours(day: 3, label: "Středa", start: "10:30", end: "22:00"),
            OpeningHours(day: 4, label: "Čtvrtek", start: "10:30", end: "22:00"),
            OpeningHours(day: 5, label: "Pátek", start: "10:30", end: "23:00"),
            OpeningHours(day: 6, label: "Sobota", start: "12:00", end: "22:00"),
            OpeningHours(day: 0, label: "Neděle", start: "14:00", end: "21:00"),
        ]
        let cancelled = [
            CancellationNotice(id: "recurring-juniori-pa-x", date: weekdays[3], start: "16:00", end: "17:00", title: "Junioři"),
        ]

        return AvailabilityResponse(bookings: bookings, hall: HallSettings(openingHours: hours), recurringCancellations: cancelled)
    }

    static let trainers = [TrainerInfo(name: "Jirka", trainer: "jirka")]

    static var trainerCalendar: TrainerCalendar {
        let mine = [
            TrainerLesson(id: "l1", date: day(1), start: "17:00", end: "17:45", requester: "Tereza Nováková", status: "confirmed", note: nil, partner: "Martin", guest: nil, phone: nil),
            TrainerLesson(id: "l2", date: day(3), start: "18:00", end: "18:45", requester: "Tereza Nováková", status: "pending", note: "Prosím jive a samba.", partner: "Martin", guest: nil, phone: nil),
        ]
        var slots: [LessonSlot] = []

        for (offset, times) in [(2, ["16:00", "16:45", "17:30"]), (4, ["15:00", "15:45", "16:30", "17:15"]), (5, ["10:00", "10:45"])] {
            for time in times {
                let end = Dates.time(Dates.minutes(time) + 45)
                slots.append(LessonSlot(date: day(offset), start: time, end: end, state: "free", lessonId: nil, requester: nil))
            }
        }

        return TrainerCalendar(
            canManage: false,
            lessons: [],
            mine: mine,
            requests: [],
            slots: slots,
            trainer: "jirka",
            trainerName: "Jirka",
            viewerPartner: "Martin"
        )
    }

    static var schedule: PublicScheduleResponse {
        let first = Dates.date(day(1)) ?? Date()
        let second = Dates.date(day(2)) ?? Date()
        let label = { (date: Date) -> String in
            "\(Dates.calendar.component(.day, from: date)).\(Dates.calendar.component(.month, from: date))."
        }
        let body = """
        \(label(first))
        10:00–10:45 – Novák / Dvořáková
        10:45–11:30 – Svoboda / Černá
        11:30–12:15 – Procházka / Veselá
        12:15–13:00 – Kučera / Horáková
        13:00–13:45 – Oběd
        13:45–14:30 – Novák / Dvořáková
        14:30–15:15 – Marek / Pokorná
        15:15–15:30 – Coffee break
        15:30–16:15 – Svoboda / Černá
        18:00–19:00 – GROUP LAT
        \(label(second))
        9:30–10:15 – Kučera / Horáková
        10:15–11:00 – Procházka / Veselá
        11:00–11:45 – Marek / Pokorná
        12:00–13:00 – Oběd
        13:00–14:00 – GROUP STT
        """

        return PublicScheduleResponse(
            body: body,
            published: true,
            publishedAt: ISO8601DateFormatter().string(from: Date()),
            title: "Externí trenér – Massimo"
        )
    }
}
