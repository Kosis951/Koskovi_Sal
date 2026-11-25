import Foundation

// The visiting trainer's schedule, written as plain text (same rules as
// src/lib/public-schedule.ts on the web):
//
//   5.11.
//   10:00–10:45 – Bílý
//   13:00–13:45 – Oběd
//   18:00-19:00 - GROUP
enum ScheduleRowKind: Hashable {
    case pause, group, lesson, note
}

struct ScheduleRow: Hashable, Identifiable {
    let id = UUID()
    let kind: ScheduleRowKind
    let start: String?
    let end: String?
    let text: String

    // "GROUP" is called a seminar ("GROUP LAT" → "Seminář LAT").
    var label: String {
        guard kind == .group else { return text }
        return ScheduleParser.groupWord.stringByReplacingMatches(
            in: text,
            range: NSRange(text.startIndex..., in: text),
            withTemplate: "Seminář"
        )
    }
}

struct ScheduleDay: Hashable, Identifiable {
    let id = UUID()
    // Missing when rows come before the first date.
    let dateKey: String?
    var rows: [ScheduleRow]
}

enum ScheduleParser {
    private static let dateLine = regex(#"^\s*(?:\p{L}+\s+)?(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?\s*:?\s*$"#)
    private static let timeLine = regex(#"^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*(?:[-–—:]\s*)?(.*)$"#)
    private static let breakWords = regex("oběd|obed|coffee|káva|kafe|pauza|přestávka|prestavka|break|svačina")
    private static let groupWords = regex("group|skupin|semin[aá][rř]")
    static let groupWord = regex(#"\bgroup\b"#)

    private static func regex(_ pattern: String) -> NSRegularExpression {
        // The patterns are fixed, so this cannot fail.
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static func groups(_ regex: NSRegularExpression, _ line: String) -> [String?]? {
        guard let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            Range(match.range(at: index), in: line).map { String(line[$0]) }
        }
    }

    private static func contains(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    // `todayKey` picks the year for dates written without one: the one that
    // puts the date closest to today.
    static func parse(_ body: String, todayKey: String) -> [ScheduleDay] {
        var days: [ScheduleDay] = []

        for line in body.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }

            if let date = groups(dateLine, line),
               let day = date[1].flatMap(Int.init),
               let month = date[2].flatMap(Int.init),
               let key = dateKey(day: day, month: month, year: date[3].flatMap(Int.init), todayKey: todayKey) {
                days.append(ScheduleDay(dateKey: key, rows: []))
                continue
            }

            if days.isEmpty {
                days.append(ScheduleDay(dateKey: nil, rows: []))
            }

            if let time = groups(timeLine, line),
               let h1 = time[1].flatMap(Int.init), let m1 = time[2].flatMap(Int.init),
               let h2 = time[3].flatMap(Int.init), let m2 = time[4].flatMap(Int.init),
               h1 < 24, m1 < 60, h2 < 24, m2 < 60 {
                let text = (time[5] ?? "").trimmingCharacters(in: .whitespaces)
                let kind: ScheduleRowKind = contains(breakWords, text) ? .pause : contains(groupWords, text) ? .group : .lesson
                days[days.count - 1].rows.append(
                    ScheduleRow(
                        kind: kind,
                        start: String(format: "%02d:%02d", h1, m1),
                        end: String(format: "%02d:%02d", h2, m2),
                        text: text
                    )
                )
            } else {
                days[days.count - 1].rows.append(ScheduleRow(kind: .note, start: nil, end: nil, text: trimmed))
            }
        }

        return days.filter { !$0.rows.isEmpty || $0.dateKey != nil }
    }

    private static func dateKey(day: Int, month: Int, year: Int?, todayKey: String) -> String? {
        guard (1...12).contains(month), (1...31).contains(day), let today = Dates.date(todayKey) else { return nil }

        let todayYear = Dates.calendar.component(.year, from: today)
        let candidates = (year.map { [$0] } ?? [todayYear - 1, todayYear, todayYear + 1]).compactMap { candidate -> Date? in
            let components = DateComponents(year: candidate, month: month, day: day, hour: 12)
            guard let date = Dates.calendar.date(from: components),
                  Dates.calendar.component(.day, from: date) == day else { return nil }
            return date
        }

        let closest = candidates.min { abs($0.timeIntervalSince(today)) < abs($1.timeIntervalSince(today)) }
        return closest.map(Dates.key)
    }

    // Names compare without case and extra spaces.
    static func nameKey(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
    }
}
