import SwiftUI

// What kinds of things happen on a day, for the dots under the date.
enum DayKind: CaseIterable {
    case training, event, busy, cleanup

    var style: KindStyle {
        switch self {
        case .training: return Theme.training
        case .event: return Theme.event
        case .busy: return Theme.busy
        case .cleanup: return Theme.cleanup
        }
    }
}

extension HallModel {
    func kinds(on day: String) -> [DayKind] {
        let dayBookings = bookings(on: day)
        var kinds: [DayKind] = []

        if dayBookings.contains(where: \.isTraining) { kinds.append(.training) }
        if dayBookings.contains(where: { !$0.isTraining && !$0.isBusy }) { kinds.append(.event) }
        if dayBookings.contains(where: \.isBusy) { kinds.append(.busy) }
        if dayBookings.contains(where: \.waitsForCleanup) { kinds.append(.cleanup) }

        return kinds
    }
}

// Coloured dots for a day (one per kind).
struct DayDots: View {
    let kinds: [DayKind]
    var onGradient = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(kinds, id: \.self) { kind in
                Circle()
                    .fill(onGradient ? Color.white : kind.style.line)
                    .overlay(Circle().stroke(onGradient ? Color.clear : kind.style.ink.opacity(0.35), lineWidth: 0.5))
                    .frame(width: 6, height: 6)
            }
        }
        .frame(height: 6)
    }
}

enum CalendarMode: String {
    case week, month
}

// Week strip or month grid with navigation and the mode switch.
// The week strip or month grid; swiping it (or the arrows) moves to the
// next or previous week/month, and the days follow the finger.
struct CalendarCard: View {
    @Binding var mode: CalendarMode
    @Binding var selectedDay: String
    let kinds: (String) -> [DayKind]
    @State private var dragOffset: CGFloat = 0
    @State private var forward = true

    // Changes when another week/month is shown (for the slide and haptics).
    private var period: String {
        mode == .week ? Dates.weekStart(selectedDay) : String(selectedDay.prefix(7))
    }

    private var weekDays: [String] {
        let start = Dates.weekStart(selectedDay)
        return (0..<7).map { Dates.addDays($0, to: start) }
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button {
                    move(-1)
                } label: {
                    Image(systemName: "chevron.left").frame(width: 32, height: 32)
                }
                .accessibilityLabel(mode == .week ? "Předchozí týden" : "Předchozí měsíc")

                Text(mode == .week ? weekTitle : Dates.monthTitle(selectedDay))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity)

                Button {
                    move(1)
                } label: {
                    Image(systemName: "chevron.right").frame(width: 32, height: 32)
                }
                .accessibilityLabel(mode == .week ? "Další týden" : "Další měsíc")
            }
            .foregroundStyle(Theme.accent)

            HStack(spacing: 8) {
                ChoicePills(options: [("week", "Týden"), ("month", "Měsíc")], selection: Binding(
                    get: { mode.rawValue },
                    set: { mode = CalendarMode(rawValue: $0) ?? .week }
                ))
                if selectedDay != Dates.todayKey() {
                    Button("Dnes") {
                        withAnimation(.snappy) { selectedDay = Dates.todayKey() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 6)
                }
            }

            ZStack {
                Group {
                    if mode == .week {
                        HStack(spacing: 4) {
                            ForEach(weekDays, id: \.self) { day in
                                DayCell(day: day, selectedDay: $selectedDay, kinds: kinds(day), showsWeekday: true, dimmed: false)
                            }
                        }
                    } else {
                        MonthGrid(selectedDay: $selectedDay, kinds: kinds)
                    }
                }
                .id(period)
                .transition(.asymmetric(
                    insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                    removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)
                ))
            }
            .offset(x: dragOffset)
            .clipped()
            .contentShape(Rectangle())
            .simultaneousGesture(
                DragGesture(minimumDistance: 15)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        dragOffset = value.translation.width * 0.5
                    }
                    .onEnded { value in
                        let width = value.translation.width
                        let isSwipe = abs(width) > abs(value.translation.height) && abs(width) > 50
                        if isSwipe {
                            move(width < 0 ? 1 : -1)
                        } else {
                            withAnimation(.snappy) { dragOffset = 0 }
                        }
                    }
            )
        }
        .card(padding: 12)
        .sensoryFeedback(.selection, trigger: period)
    }

    private func move(_ direction: Int) {
        forward = direction > 0
        withAnimation(.snappy(duration: 0.3)) {
            dragOffset = 0
            step(direction)
        }
    }

    private var weekTitle: String {
        let first = weekDays.first ?? selectedDay
        let last = weekDays.last ?? selectedDay
        return "\(Dates.dayNumber(first)). – \(Dates.dayTitle(last).split(separator: " ").dropFirst().joined(separator: " "))"
    }

    private func step(_ direction: Int) {
        if mode == .week {
            selectedDay = Dates.addDays(7 * direction, to: selectedDay)
        } else {
            selectedDay = Dates.addMonths(direction, to: selectedDay)
        }
    }
}

struct DayCell: View {
    let day: String
    @Binding var selectedDay: String
    let kinds: [DayKind]
    let showsWeekday: Bool
    let dimmed: Bool

    var body: some View {
        let isSelected = day == selectedDay
        let isToday = day == Dates.todayKey()

        Button {
            withAnimation(.snappy) { selectedDay = day }
        } label: {
            VStack(spacing: 4) {
                if showsWeekday {
                    Text(Dates.shortWeekday(day))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(isSelected ? Color.white.opacity(0.85) : Theme.inkSoft)
                }
                Text(Dates.dayNumber(day))
                    .font(showsWeekday ? .headline : .subheadline.weight(.semibold))
                    .foregroundStyle(isSelected ? Color.white : (isToday ? Theme.accent : Theme.ink))
                DayDots(kinds: kinds, onGradient: isSelected)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, showsWeekday ? 8 : 6)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? AnyShapeStyle(Theme.gradient) : AnyShapeStyle(isToday ? Theme.subtle : Color.clear))
            )
            .opacity(dimmed ? 0.35 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Dates.dayTitle(day))
    }
}

struct MonthGrid: View {
    @Binding var selectedDay: String
    let kinds: (String) -> [DayKind]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        let month = String(selectedDay.prefix(7))
        let days = Dates.monthGrid(selectedDay)

        VStack(spacing: 6) {
            HStack(spacing: 4) {
                ForEach(Array(days.prefix(7)), id: \.self) { day in
                    Text(Dates.shortWeekday(day))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Theme.inkSoft)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(days, id: \.self) { day in
                    DayCell(day: day, selectedDay: $selectedDay, kinds: kinds(day), showsWeekday: false, dimmed: !day.hasPrefix(month))
                }
            }
        }
    }
}

// The day from opening to closing: occupied parts in their colour, the rest
// free (green), with hour marks.
struct OccupancyBar: View {
    let model: HallModel
    let day: String

    var body: some View {
        if let hours = model.hours(on: day) {
            let open = Dates.minutes(hours.start)
            let close = Dates.minutes(hours.end)
            let length = CGFloat(max(close - open, 1))

            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { geometry in
                    let width = geometry.size.width

                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 6).fill(Theme.free.background)
                        RoundedRectangle(cornerRadius: 6).stroke(Theme.free.line, lineWidth: 1)

                        ForEach(model.bookings(on: day)) { booking in
                            let start = max(Dates.minutes(booking.start), open)
                            let end = min(Dates.minutes(booking.end), close)

                            if end > start {
                                let style = booking.waitsForCleanup ? Theme.cleanup : Theme.style(for: booking)
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(style.line)
                                    .frame(width: max(CGFloat(end - start) / length * width, 3))
                                    .offset(x: CGFloat(start - open) / length * width)
                            }
                        }

                        if day == Dates.todayKey() {
                            let now = Dates.minutes(Dates.nowTime())
                            if now > open && now < close {
                                Rectangle()
                                    .fill(Theme.now)
                                    .frame(width: 2)
                                    .offset(x: CGFloat(now - open) / length * width)
                            }
                        }
                    }
                }
                .frame(height: 18)

                HStack {
                    Text(hours.start)
                    Spacer()
                    Text(Dates.time((open + close) / 2 / 60 * 60))
                    Spacer()
                    Text(hours.end)
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Theme.inkSoft)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Obsazenost sálu \(Dates.dayTitle(day))")
        }
    }
}

struct CalendarLegend: View {
    private let items: [(String, KindStyle)] = [
        ("Trénink", Theme.training),
        ("Akce", Theme.event),
        ("Obsazeno", Theme.busy),
        ("Úklid", Theme.cleanup),
        ("Volno", Theme.free),
    ]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.0) { item in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(item.1.background)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(item.1.line, lineWidth: 1.5))
                        .frame(width: 16, height: 12)
                    Text(item.0).font(.caption.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                }
            }
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(Theme.line, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    .frame(width: 16, height: 12)
                Text("Zrušeno").font(.caption.weight(.semibold)).foregroundStyle(Theme.inkMuted)
            }
        }
    }
}
