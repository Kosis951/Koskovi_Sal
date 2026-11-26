import Foundation

// Dates travel as "YYYY-MM-DD" keys and "HH:MM" times in Prague time, as on
// the web.
enum Dates {
    static let prague = TimeZone(identifier: "Europe/Prague") ?? .current
    static let czech = Locale(identifier: "cs_CZ")

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = prague
        calendar.locale = czech
        calendar.firstWeekday = 2
        return calendar
    }()

    private static let keyFormatter = formatter("yyyy-MM-dd", posix: true)
    private static let timeFormatter = formatter("HH:mm", posix: true)
    private static let dayFormatter = formatter("EEEE d. M.")
    private static let shortDayFormatter = formatter("EEEEEE")
    private static let monthFormatter = formatter("LLLL yyyy")
    private static let dateTimeFormatter = formatter("EEE d. M. HH:mm")

    private static func formatter(_ format: String, posix: Bool = false) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = prague
        formatter.locale = posix ? Locale(identifier: "en_US_POSIX") : czech
        formatter.dateFormat = format
        return formatter
    }

    static func key(_ date: Date) -> String { keyFormatter.string(from: date) }

    // Noon, so adding days never trips over the clock change.
    static func date(_ key: String) -> Date? {
        guard let day = keyFormatter.date(from: key) else { return nil }
        return calendar.date(byAdding: .hour, value: 12, to: day)
    }

    static func todayKey() -> String { key(Date()) }
    static func nowTime(_ date: Date = Date()) -> String { timeFormatter.string(from: date) }

    static func addDays(_ days: Int, to key: String) -> String {
        guard let date = date(key), let next = calendar.date(byAdding: .day, value: days, to: date) else { return key }
        return self.key(next)
    }

    // The same day a number of months later (the 31st becomes the month's last day).
    static func addMonths(_ months: Int, to key: String) -> String {
        guard let date = date(key), let next = calendar.date(byAdding: .month, value: months, to: date) else { return key }
        return self.key(next)
    }

    // Whole weeks (Monday to Sunday) covering the month the day is in.
    static func monthGrid(_ key: String) -> [String] {
        let first = String(key.prefix(8)) + "01"
        let nextMonth = String(addMonths(1, to: first).prefix(8)) + "01"
        var day = weekStart(first)
        var days: [String] = []

        while day < nextMonth || days.count % 7 != 0 {
            days.append(day)
            day = addDays(1, to: day)
        }

        return days
    }

    // Monday of the week the day is in.
    static func weekStart(_ key: String) -> String {
        guard let date = date(key) else { return key }
        let weekday = calendar.component(.weekday, from: date)
        return addDays(-((weekday + 5) % 7), to: key)
    }

    // 0 = Sunday … 6 = Saturday, as JavaScript's getDay() on the web.
    static func jsWeekday(_ key: String) -> Int {
        guard let date = date(key) else { return 0 }
        return calendar.component(.weekday, from: date) - 1
    }

    static func dayNumber(_ key: String) -> String {
        guard let date = date(key) else { return "" }
        return String(calendar.component(.day, from: date))
    }

    // "čtvrtek 5. 11."
    static func dayTitle(_ key: String) -> String {
        guard let date = date(key) else { return key }
        return dayFormatter.string(from: date)
    }

    // "Čt"
    static func shortWeekday(_ key: String) -> String {
        guard let date = date(key) else { return "" }
        return shortDayFormatter.string(from: date).capitalized(with: czech)
    }

    static func monthTitle(_ key: String) -> String {
        guard let date = date(key) else { return "" }
        return monthFormatter.string(from: date).capitalized(with: czech)
    }

    static func dateTime(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        return dateTimeFormatter.string(from: date)
    }

    static func isoDate(_ iso: String) -> Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    static func minutes(_ time: String) -> Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }

    static func time(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
}
