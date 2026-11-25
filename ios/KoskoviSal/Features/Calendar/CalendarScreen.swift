import SwiftUI

struct CalendarScreen: View {
    @Environment(SessionModel.self) private var session
    @State private var model = HallModel()
    @State private var selectedDay = Dates.todayKey()
    @State private var openBooking: Booking?
    @State private var isAdding = false

    private var weekDays: [String] {
        let start = Dates.weekStart(selectedDay)
        return (0..<7).map { Dates.addDays($0, to: start) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    WeekStrip(
                        days: weekDays,
                        selectedDay: $selectedDay,
                        count: { model.bookings(on: $0).count }
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                }

                Section {
                    if let error = model.error {
                        ErrorBanner(text: error)
                    }

                    if !model.hasLoaded && model.isLoading {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if model.hours(on: selectedDay) == nil && model.bookings(on: selectedDay).isEmpty {
                        Text("Sál je zavřený.").foregroundStyle(.secondary)
                    } else {
                        ForEach(model.items(on: selectedDay)) { item in
                            DayItemRow(item: item) {
                                if case .booking(let booking) = item {
                                    openBooking = booking
                                }
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text(Dates.dayTitle(selectedDay))
                        Spacer()
                        if let hours = model.hours(on: selectedDay) {
                            Text("otevřeno \(hours.start)–\(hours.end)")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Dates.monthTitle(selectedDay))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if selectedDay != Dates.todayKey() {
                        Button("Dnes") { selectedDay = Dates.todayKey() }
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        selectedDay = Dates.addDays(-7, to: selectedDay)
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .accessibilityLabel("Předchozí týden")

                    Button {
                        selectedDay = Dates.addDays(7, to: selectedDay)
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .accessibilityLabel("Další týden")

                    if session.role?.canAddBookings == true {
                        Button {
                            isAdding = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Přidat akci")
                    }
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 40).onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) * 2 else { return }
                    selectedDay = Dates.addDays(value.translation.width < 0 ? 1 : -1, to: selectedDay)
                }
            )
            .refreshable { await model.load() }
            .task { await model.load() }
            .onChange(of: session.isSignedIn) {
                Task { await model.load() }
            }
            .sheet(item: $openBooking) { booking in
                BookingDetailView(booking: booking, model: model, canEdit: session.canEdit(booking))
            }
            .sheet(isPresented: $isAdding) {
                AddBookingView(model: model, date: selectedDay)
            }
        }
    }
}

struct WeekStrip: View {
    let days: [String]
    @Binding var selectedDay: String
    let count: (String) -> Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(days, id: \.self) { day in
                let isSelected = day == selectedDay
                let isToday = day == Dates.todayKey()

                Button {
                    selectedDay = day
                } label: {
                    VStack(spacing: 4) {
                        Text(Dates.shortWeekday(day))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(isSelected ? .white.opacity(0.85) : .secondary)
                        Text(Dates.dayNumber(day))
                            .font(.headline)
                            .foregroundStyle(isSelected ? .white : (isToday ? Theme.accent : .primary))
                        Circle()
                            .fill(count(day) > 0 ? (isSelected ? Color.white : Theme.accent) : .clear)
                            .frame(width: 5, height: 5)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(isSelected ? AnyShapeStyle(Theme.gradient) : AnyShapeStyle(Color.clear))
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Dates.dayTitle(day))
            }
        }
    }
}

struct DayItemRow: View {
    let item: DayItem
    let onOpen: () -> Void

    var body: some View {
        switch item {
        case .booking(let booking):
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    KindBar(color: Theme.color(for: booking))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(booking.start)–\(booking.end)")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Text(booking.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                        HStack(spacing: 6) {
                            Text(booking.kindLabel)
                            if booking.waitsForCleanup {
                                Label("čeká na úklid", systemImage: "sparkles")
                                    .foregroundStyle(Theme.cleanup)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 2)
            }
            .buttonStyle(.plain)

        case .cancelled(let notice):
            HStack(spacing: 12) {
                KindBar(color: .secondary.opacity(0.4))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(notice.start)–\(notice.end)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(notice.title)
                        .strikethrough()
                        .foregroundStyle(.secondary)
                    Text("Trénink zrušen").font(.caption).foregroundStyle(.secondary)
                }
            }

        case .free(let start, let end):
            HStack(spacing: 12) {
                KindBar(color: Theme.free.opacity(0.6))
                Text("\(start)–\(end)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                Text("Volno").foregroundStyle(Theme.free)
            }
        }
    }
}
