import Observation
import SwiftUI

// The guide shown after registration (and from Účet → Průvodce aplikací): it
// goes through the tabs, darkens the screen around one thing at a time and
// explains it.

enum TourTarget: String, Hashable {
    case hallStatus, calendarCard, dayCard, lessons, scheduleMine, notifications, partner
}

struct TourStep {
    let tab: AppTab
    let target: TourTarget?
    let title: String
    let text: String
    // The made-up time of day the hall calendar shows (default 17:00).
    var hallTime: String? = nil
}

@MainActor
@Observable
final class TourModel {
    static let shared = TourModel()

    private(set) var steps: [TourStep] = []
    private(set) var index: Int?

    var step: TourStep? {
        guard let index, steps.indices.contains(index) else { return nil }
        return steps[index]
    }

    var isLast: Bool { index == steps.count - 1 }
    // While on, the screens show made-up data (Demo.tour…).
    var isActive: Bool { index != nil }

    // After registration, once the sign-in windows have closed.
    func startAfterRegistration() {
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            start()
        }
    }

    // Between two steps: the highlight and the bubble are hidden while the
    // screen scrolls (or the tab changes), then fade in at the new place.
    private(set) var isMoving = false
    private var move = 0

    func start() {
        steps = Self.steps
        isMoving = false
        withAnimation(.easeInOut(duration: 0.3)) { index = 0 }
    }

    func next() {
        guard let index else { return }
        if index + 1 < steps.count {
            go(to: index + 1)
        } else {
            finish()
        }
    }

    func back() {
        guard let index, index > 0 else { return }
        go(to: index - 1)
    }

    func finish() {
        isMoving = false
        withAnimation(.easeInOut(duration: 0.3)) { index = nil }
    }

    private func go(to newIndex: Int) {
        move += 1
        let current = move
        withAnimation(.easeOut(duration: 0.15)) { isMoving = true }
        withAnimation(.smooth(duration: 0.45)) { index = newIndex }
        Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard current == move else { return }
            withAnimation(.easeOut(duration: 0.25)) { isMoving = false }
        }
    }

    // Where the screen of `tab` should scroll to for the current step.
    func scrollTarget(on tab: AppTab) -> TourTarget? {
        step?.tab == tab ? step?.target : nil
    }

    private static let steps = [
        TourStep(tab: .calendar, target: nil, title: "Vítej v TK Koškovi!",
                 text: "Za minutku ti ukážu, kde co najdeš – na smyšlených ukázkových datech, tvoje skutečná se vrátí hned po průvodci. Můžeš ho kdykoli přeskočit a pustit si ho znovu v Účtu.",
                 hallTime: "12:00"),
        TourStep(tab: .calendar, target: .hallStatus, title: "Je sál volný?",
                 text: "Tady hned vidíš, co je v sále právě teď. Zelená = sál je volný a můžeš přijít trénovat. Červená = obsazeno, šedá = zavřeno.",
                 hallTime: "12:00"),
        TourStep(tab: .calendar, target: .hallStatus, title: "A co je „Čeká na úklid“?",
                 text: "Tohle není obsazeno! Akce už skončila a sál je volný, klidně můžeš trénovat. Jen po ní ještě nikdo nepotvrdil úklid – kdo sál uklidí, klepne na „Uklidil jsem sál“."),
        TourStep(tab: .calendar, target: .calendarCard, title: "Kalendář sálu",
                 text: "Klepni na den a uvidíš jeho program. Přetažením prstem doleva nebo doprava přepneš týden či měsíc."),
        TourStep(tab: .calendar, target: .dayCard, title: "Program dne",
                 text: "Akce, tréninky i volné časy vybraného dne. Štítek „Čeká na úklid“ u akce neznamená obsazeno – po jejím konci je sál volný."),
        TourStep(tab: .lessons, target: .lessons, title: "Lekce u trenérů",
                 text: "Volné termíny tvého trenéra. Klepni na termín, objednej si lekci a trenér ji potvrdí."),
        TourStep(tab: .schedule, target: .scheduleMine, title: "Rozpis externího trenéra",
                 text: "Když přijede externí trenér, najdeš tu jeho rozpis. Tvoje lekce najdeme podle příjmení, zvýrazní se a připomeneme ti je hodinu předem."),
        TourStep(tab: .account, target: .notifications, title: "Upozornění",
                 text: "Zapni si, co chceš vědět: obsazený sál, úklid, nebo připomínku své lekce s odpočtem."),
        TourStep(tab: .account, target: .partner, title: "Partner/ka",
                 text: "Tančíte každý na svůj účet? Najdi partnera nebo partnerku a uvidíte lekce společně."),
        TourStep(tab: .account, target: nil, title: "Hotovo!",
                 text: "Průvodce najdeš kdykoli v Účtu. Ať se ti dobře tančí!"),
    ]
}

struct TourAnchorKey: PreferenceKey {
    static var defaultValue: [TourTarget: Anchor<CGRect>] = [:]

    static func reduce(value: inout [TourTarget: Anchor<CGRect>], nextValue: () -> [TourTarget: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

extension View {
    // A thing the guide can point at (and scroll to).
    func tourTarget(_ target: TourTarget) -> some View {
        id(target).anchorPreference(key: TourAnchorKey.self, value: .bounds) { [target: $0] }
    }

    // The guide's layer over a tab's screen.
    func tourOverlay(_ tab: AppTab) -> some View {
        overlayPreferenceValue(TourAnchorKey.self) { anchors in
            TourLayer(tab: tab, anchors: anchors)
        }
    }

    // Scrolls the tab's screen so what the guide points at is at the top (the
    // bubble is at the bottom); extra room below lets even the last cards get
    // up there.
    func tourScroll(_ tab: AppTab) -> some View {
        scrollPosition(id: Binding(get: { TourModel.shared.scrollTarget(on: tab) }, set: { _ in }), anchor: .top)
            .contentMargins(.bottom, TourModel.shared.isActive ? 420 : 0, for: .scrollContent)
    }
}

private struct TourLayer: View {
    let tab: AppTab
    let anchors: [TourTarget: Anchor<CGRect>]
    @State private var bubbleHeight: CGFloat = 190
    private var tour: TourModel { TourModel.shared }

    var body: some View {
        if let step = tour.step, step.tab == tab, let index = tour.index {
            GeometryReader { proxy in
                // The highlight stays above the bubble, never under it.
                let free = CGRect(x: 0, y: 0, width: proxy.size.width, height: max(proxy.size.height - bubbleHeight - 24, 0))
                let hole = step.target
                    .flatMap { anchors[$0] }
                    .map { proxy[$0].insetBy(dx: -8, dy: -8) }
                    .map { $0.intersection(free.insetBy(dx: 4, dy: 4)) }
                    .flatMap { $0.isNull || $0.height < 20 ? nil : $0 }
                let shown = !tour.isMoving && hole != nil

                ZStack(alignment: .bottom) {
                    Rectangle()
                        .fill(Color.black.opacity(0.62))
                        .mask {
                            ZStack {
                                Rectangle()
                                if let hole {
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .frame(width: hole.width, height: hole.height)
                                        .position(x: hole.midX, y: hole.midY)
                                        .blendMode(.destinationOut)
                                        .opacity(shown ? 1 : 0)
                                }
                            }
                            .compositingGroup()
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {}

                    if let hole {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(Theme.accentSoft, lineWidth: 2.5)
                            .frame(width: hole.width, height: hole.height)
                            .position(x: hole.midX, y: hole.midY)
                            .opacity(shown ? 1 : 0)
                            .allowsHitTesting(false)
                    }

                    bubble(step: step, index: index)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                        .background(
                            GeometryReader { bubble in
                                Color.clear
                                    .onAppear { bubbleHeight = bubble.size.height }
                                    .onChange(of: bubble.size.height) { bubbleHeight = bubble.size.height }
                            }
                        )
                        .opacity(tour.isMoving ? 0 : 1)
                        .offset(y: tour.isMoving ? 12 : 0)
                }
            }
            .transition(.opacity)
        }
    }

    private func bubble(step: TourStep, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(step.title)
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
                Spacer()
                Text("\(index + 1)/\(tour.steps.count)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Theme.inkSoft)
            }
            Text(step.text)
                .font(.subheadline)
                .foregroundStyle(Theme.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if !tour.isLast {
                    Button("Přeskočit") { tour.finish() }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.inkMuted)
                }
                Spacer()
                if index > 0 {
                    Button {
                        tour.back()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.subheadline.weight(.bold))
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Theme.subtle))
                    }
                    .accessibilityLabel("Zpět")
                }
                Button(tour.isLast ? "Hotovo" : "Další") { tour.next() }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .frame(height: 40)
                    .background(Capsule().fill(Theme.gradient))
            }
        }
        .padding(16)
        .frame(maxWidth: 420)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.surface))
        .shadow(color: .black.opacity(0.25), radius: 18, y: 6)
        .sensoryFeedback(.selection, trigger: index)
    }
}
