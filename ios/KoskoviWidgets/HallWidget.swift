import SwiftUI
import WidgetKit

// The hall calendar on the home and lock screen: the bigger the widget, the
// more it shows (status → today's programme → tomorrow too).

struct HallEntry: TimelineEntry {
    struct Line: Hashable {
        let time: String
        let title: String
        let tone: HallStatus.Tone
        let struck: Bool
    }

    let date: Date
    let title: String
    let detail: String
    let tone: HallStatus.Tone
    let today: [Line]
    let tomorrow: [Line]
    let failed: Bool

    static let placeholder = HallEntry(
        date: Date(),
        title: "Sál je teď volný do 17:00",
        detail: "Pak Junioři (17:00–18:30).",
        tone: .free,
        today: [
            Line(time: "15:00–17:00", title: "Volno", tone: .free, struck: false),
            Line(time: "17:00–18:30", title: "Junioři", tone: .busy, struck: false),
        ],
        tomorrow: [Line(time: "10:00–14:00", title: "Seminář LAT", tone: .busy, struck: false)],
        failed: false
    )
}

struct HallProvider: TimelineProvider {
    func placeholder(in context: Context) -> HallEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (HallEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }
        Task { completion(await Self.entries().first ?? .placeholder) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HallEntry>) -> Void) {
        Task {
            let entries = await Self.entries()
            // New data every half hour; the entries in between follow the day.
            completion(Timeline(entries: entries, policy: .after(Date().addingTimeInterval(30 * 60))))
        }
    }

    // One entry now and one at every change today (a booking starting or
    // ending), so the status stays right between downloads.
    @MainActor
    static func entries() async -> [HallEntry] {
        let model = HallModel()
        await model.load()
        let now = Date()

        guard model.hasLoaded else {
            return [HallEntry(date: now, title: "Kalendář se nepodařilo načíst", detail: "Zkusíme to za chvíli.", tone: .closed, today: [], tomorrow: [], failed: true)]
        }

        let today = Dates.key(now)
        let changes = model.bookings(on: today)
            .flatMap { [$0.start, $0.end] }
            .compactMap { time -> Date? in
                guard let day = Dates.date(today) else { return nil }
                let minutes = Dates.minutes(time)
                let midnight = Calendar.current.startOfDay(for: day)
                return midnight.addingTimeInterval(TimeInterval(minutes * 60))
            }
            .filter { $0 > now }
        let dates = ([now] + Array(Set(changes)).sorted()).prefix(12)

        return dates.map { date in
            let status = model.status(now: date)
            return HallEntry(
                date: date,
                title: status.title,
                detail: status.detail,
                tone: status.tone,
                today: lines(model.items(on: today, at: date)),
                tomorrow: lines(model.items(on: Dates.addDays(1, to: today))),
                failed: false
            )
        }
    }

    @MainActor
    private static func lines(_ items: [DayItem]) -> [HallEntry.Line] {
        items.map { item in
            switch item {
            case .booking(let booking):
                return HallEntry.Line(
                    time: "\(booking.start)–\(booking.end)",
                    title: booking.title,
                    tone: booking.waitsForCleanup ? .cleanup : (booking.isTraining ? .closed : .busy),
                    struck: false
                )
            case .cancelled(let notice):
                return HallEntry.Line(time: "\(notice.start)–\(notice.end)", title: notice.title, tone: .closed, struck: true)
            case .free(let start, let end):
                return HallEntry.Line(time: "\(start)–\(end)", title: "Volno", tone: .free, struck: false)
            }
        }
    }
}

private enum HallColors {
    static let brand = Color(red: 0, green: 0.216, blue: 0.345)

    static func color(_ tone: HallStatus.Tone) -> Color {
        switch tone {
        case .free: return Color(red: 0.18, green: 0.62, blue: 0.36)
        case .busy: return Color(red: 0.85, green: 0.33, blue: 0.22)
        case .cleanup: return Color(red: 0.88, green: 0.62, blue: 0.10)
        case .closed: return Color(red: 0.45, green: 0.55, blue: 0.62)
        }
    }

    static func symbol(_ tone: HallStatus.Tone) -> String {
        switch tone {
        case .free: return "checkmark.circle.fill"
        case .busy: return "person.3.fill"
        case .cleanup: return "sparkles"
        case .closed: return "moon.fill"
        }
    }
}

struct HallWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HallEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(entry.title, systemImage: HallColors.symbol(entry.tone))
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Label("Sál", systemImage: HallColors.symbol(entry.tone))
                    .font(.caption.weight(.bold))
                Text(entry.title).font(.caption).lineLimit(2)
            }
        case .accessoryCircular:
            Image(systemName: HallColors.symbol(entry.tone)).font(.title2)
        case .systemSmall:
            small
        case .systemLarge, .systemExtraLarge:
            large
        default:
            medium
        }
    }

    private var statusBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: HallColors.symbol(entry.tone))
                    .foregroundStyle(HallColors.color(entry.tone))
                Text("Sál").font(.caption.weight(.heavy)).foregroundStyle(.secondary)
            }
            Text(entry.title)
                .font(.subheadline.weight(.bold))
                .lineLimit(family == .systemSmall ? 3 : 2)
                .minimumScaleFactor(0.85)
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            statusBlock
            Spacer(minLength: 0)
            if let next = entry.today.first(where: { $0.title != "Volno" }) {
                Text("\(next.time.prefix(5)) \(next.title)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text(entry.detail).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                statusBlock
                Spacer(minLength: 0)
                Text(entry.detail).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text("Dnes").font(.caption.weight(.heavy)).foregroundStyle(.secondary)
                lineList(entry.today, limit: 4, empty: "Nic v plánu")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 10) {
            statusBlock
            Text(entry.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            Divider()
            Text("Dnes").font(.caption.weight(.heavy)).foregroundStyle(.secondary)
            lineList(entry.today, limit: 6, empty: "Nic v plánu")
            Text("Zítra").font(.caption.weight(.heavy)).foregroundStyle(.secondary).padding(.top, 4)
            lineList(entry.tomorrow, limit: 4, empty: "Nic v plánu")
            Spacer(minLength: 0)
        }
    }

    private func lineList(_ lines: [HallEntry.Line], limit: Int, empty: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if lines.isEmpty {
                Text(empty).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(lines.prefix(limit)), id: \.self) { line in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(HallColors.color(line.tone))
                        .frame(width: 4, height: 14)
                    Text(line.time).font(.caption2.monospacedDigit().weight(.semibold))
                    Text(line.title)
                        .font(.caption2)
                        .strikethrough(line.struck)
                        .lineLimit(1)
                }
            }
            if lines.count > limit {
                Text("+ \(lines.count - limit) další").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

struct HallWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "cz.tkkoskovi.sal.hall", provider: HallProvider()) { entry in
            HallWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Kalendář sálu")
        .description("Jestli je sál volný a co se v něm dnes děje.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}
