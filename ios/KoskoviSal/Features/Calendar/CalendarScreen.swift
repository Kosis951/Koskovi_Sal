import SwiftUI

struct CalendarScreen: View {
    @Environment(SessionModel.self) private var session
    @Environment(\.refreshApp) private var refreshApp
    @State private var model = HallModel()
    @State private var selectedDay = Dates.todayKey()
    @State private var openBooking: Booking?
    @State private var openCancellation: CancellationNotice?
    @State private var isAdding = false
    @State private var notice: String?
    @State private var cleaningId: String?
    @AppStorage("calendar.mode") private var mode: CalendarMode = .week

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let notice {
                        NoticeBanner(text: notice)
                    }
                    if let error = model.error {
                        ErrorBanner(text: error)
                    }

                    if model.hasLoaded {
                        HallStatusCard(
                            status: model.status(),
                            hours: model.hours(on: Dates.key(model.clock ?? Date())),
                            freeHours: model.freeHours(on: Dates.key(model.clock ?? Date())),
                            isCleaning: cleaningId != nil,
                            onCleaned: { booking in Task { await clean(booking) } }
                        )
                        .tourTarget(.hallStatus)
                    }

                    CalendarCard(mode: $mode, selectedDay: $selectedDay, kinds: { model.kinds(on: $0) })
                        .tourTarget(.calendarCard)

                    dayCard
                        .tourTarget(.dayCard)
                }
                .scrollTargetLayout()
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .tourScroll(.calendar)
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Kalendář sálu", subtitle: Dates.monthTitle(selectedDay)) {
                    if session.canAddHallEvents {
                        HeaderButton(systemImage: "plus", label: "Přidat akci") { isAdding = true }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .tourOverlay(.calendar)
            .refreshable {
                async let hall: Void = model.load()
                async let app: Void = refreshApp()
                _ = await (hall, app)
            }
            .task { await model.load() }
            .onChange(of: session.isSignedIn) {
                Task { await model.load() }
            }
            // The guide shows made-up data (today), then the real again.
            .onChange(of: TourModel.shared.isActive) {
                if TourModel.shared.isActive {
                    selectedDay = Dates.todayKey()
                }
                Task { await model.load() }
            }
            .sheet(item: $openBooking) { booking in
                BookingDetailView(booking: booking, model: model, canEdit: session.canEdit(booking)) { message in
                    notice = message
                }
            }
            .sheet(item: $openCancellation) { cancellation in
                CancellationDetailView(notice: cancellation, model: model, canReinstate: session.canManageHall)
            }
            .sheet(isPresented: $isAdding) {
                AddBookingView(model: model, date: selectedDay)
            }
        }
    }

    private var dayCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(Dates.dayTitle(selectedDay).capitalized(with: Dates.czech))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                if let hours = model.hours(on: selectedDay) {
                    Label("\(hours.start)–\(hours.end)", systemImage: "clock")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.inkMuted)
                }
            }

            OccupancyBar(model: model, day: selectedDay)

            if !model.hasLoaded && model.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
            } else if model.hours(on: selectedDay) == nil && model.bookings(on: selectedDay).isEmpty {
                ClosedDayView()
            } else {
                let items = model.items(on: selectedDay)

                if items.isEmpty {
                    Text("Žádné akce.").foregroundStyle(Theme.inkMuted)
                }

                ForEach(items) { item in
                    DayItemRow(item: item) {
                        switch item {
                        case .booking(let booking): openBooking = booking
                        case .cancelled(let notice): openCancellation = notice
                        case .free: break
                        }
                    }
                }
            }

            Divider().padding(.top, 4)
            CalendarLegend()
        }
        .card()
        .simultaneousGesture(
            DragGesture(minimumDistance: 40).onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 2 else { return }
                withAnimation(.snappy) {
                    selectedDay = Dates.addDays(value.translation.width < 0 ? 1 : -1, to: selectedDay)
                }
            }
        )
    }

    private func clean(_ booking: Booking) async {
        cleaningId = booking.id
        defer { cleaningId = nil }

        do {
            notice = try await model.markCleaned(booking)
        } catch {
            model.error = error.localizedDescription
        }
    }
}

// The answer to "can I use the hall right now?".
struct HallStatusCard: View {
    let status: HallStatus
    let hours: OpeningHours?
    let freeHours: Double
    let isCleaning: Bool
    let onCleaned: (Booking) -> Void
    @State private var pulse = false

    private var style: KindStyle {
        switch status.tone {
        case .free: return Theme.free
        case .busy: return Theme.busy
        case .cleanup: return Theme.cleanup
        case .closed: return Theme.closed
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .fill(style.ink)
                    .frame(width: 12, height: 12)
                    .opacity(status.tone == .free && pulse ? 0.35 : 1)
                    .padding(.top, 6)
                VStack(alignment: .leading, spacing: 3) {
                    Text(status.title)
                        .font(.headline)
                    Text(status.detail)
                        .font(.subheadline)
                        .opacity(0.85)
                }
            }

            HStack(spacing: 14) {
                if let hours {
                    Label("Dnes \(hours.start)–\(hours.end)", systemImage: "clock")
                }
                if hours != nil {
                    Label("Volno \(freeHours.formatted(.number.precision(.fractionLength(0...1)).locale(Dates.czech))) h", systemImage: "checkmark.circle")
                }
            }
            .font(.footnote.weight(.semibold))
            .opacity(0.9)

            if let booking = status.cleanupBooking {
                Button {
                    onCleaned(booking)
                } label: {
                    if isCleaning {
                        ProgressView().tint(.white)
                    } else {
                        Label("Uklidil jsem sál", systemImage: "checkmark")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isCleaning)
            }
        }
        .foregroundStyle(style.ink)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(style.background))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(style.line, lineWidth: 1))
        .onAppear {
            withAnimation(.easeInOut(duration: 1).repeatForever()) { pulse = true }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ClosedDayView: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "moon.zzz.fill")
                .font(.title2)
            Text("Sál je tento den zavřený.")
                .font(.subheadline.weight(.semibold))
        }
        .foregroundStyle(Theme.closed.ink)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.closed.background))
    }
}

struct DayItemRow: View {
    let item: DayItem
    let onOpen: () -> Void

    var body: some View {
        switch item {
        case .booking(let booking):
            let style = Theme.style(for: booking)

            Button(action: onOpen) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(booking.start).font(.subheadline.weight(.bold).monospacedDigit())
                        Text(booking.end).font(.caption.monospacedDigit()).opacity(0.75)
                    }
                    .frame(width: 50, alignment: .leading)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(booking.title)
                            .font(.body.weight(.semibold))
                            .multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            Text(booking.kindLabel)
                            if let trainer = booking.trainer, !trainer.isEmpty {
                                Text("· \(trainer)")
                            }
                        }
                        .font(.caption.weight(.medium))
                        .opacity(0.8)
                        if booking.waitsForCleanup {
                            Badge(text: "Čeká na úklid", style: Theme.cleanup)
                        }
                    }

                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.caption.weight(.bold)).opacity(0.5)
                }
                .foregroundStyle(style.ink)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(style.background))
                .overlay(alignment: .leading) {
                    UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14)
                        .fill(style.line)
                        .frame(width: 5)
                }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)

        case .cancelled(let notice):
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    Text(notice.start)
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .frame(width: 50, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(notice.title).strikethrough().font(.body.weight(.semibold))
                        Text("Trénink zrušen · \(notice.start)–\(notice.end)").font(.caption)
                    }
                    Spacer()
                }
                .foregroundStyle(Theme.inkSoft)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Theme.line, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                )
            }
            .buttonStyle(.plain)

        case .free(let start, let end):
            HStack(spacing: 12) {
                Text(start)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .frame(width: 50, alignment: .leading)
                Label("Volno do \(end)", systemImage: "checkmark.circle")
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }
            .foregroundStyle(Theme.free.ink)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.free.background)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Theme.free.line, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            )
        }
    }
}
