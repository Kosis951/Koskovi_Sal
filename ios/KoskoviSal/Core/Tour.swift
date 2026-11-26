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
}

@MainActor
@Observable
final class TourModel {
    static let shared = TourModel()

    private(set) var steps: [TourStep] = []
    private(set) var index: Int?
    // Set by the registration; the guide starts once the sign-in window is gone.
    var startsAfterRegistration = false

    var step: TourStep? {
        guard let index, steps.indices.contains(index) else { return nil }
        return steps[index]
    }

    var isLast: Bool { index == steps.count - 1 }
    // While on, the screens show made-up data (Demo.tour…).
    var isActive: Bool { index != nil }

    func start() {
        steps = Self.steps
        withAnimation(.snappy) { index = 0 }
    }

    func next() {
        guard let index else { return }
        withAnimation(.snappy) {
            self.index = index + 1 < steps.count ? index + 1 : nil
        }
    }

    func back() {
        guard let index, index > 0 else { return }
        withAnimation(.snappy) { self.index = index - 1 }
    }

    func finish() {
        withAnimation(.snappy) { index = nil }
    }

    // Where the screen of `tab` should scroll to for the current step.
    func scrollTarget(on tab: AppTab) -> TourTarget? {
        step?.tab == tab ? step?.target : nil
    }

    private static let steps = [
        TourStep(tab: .calendar, target: nil, title: "Vítej v TK Koškovi!",
                 text: "Za minutku ti ukážu, kde co najdeš – na smyšlených ukázkových datech, tvoje skutečná se vrátí hned po průvodci. Můžeš ho kdykoli přeskočit a pustit si ho znovu v Účtu."),
        TourStep(tab: .calendar, target: .hallStatus, title: "Je sál volný?",
                 text: "Tady hned vidíš, co je v sále právě teď: zelená = volno, červená = obsazeno, šedá = zavřeno."),
        TourStep(tab: .calendar, target: .hallStatus, title: "„Čeká na úklid“ není obsazeno",
                 text: "Žlutá znamená, že sál je volný a klidně můžeš jít trénovat. Jen po předchozí akci ještě nikdo nepotvrdil úklid. Kdo sál uklidí, klepne na „Uklidil jsem sál“."),
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

    // Scrolls the tab's screen to what the guide points at.
    func tourScroll(_ tab: AppTab) -> some View {
        scrollPosition(id: Binding(get: { TourModel.shared.scrollTarget(on: tab) }, set: { _ in }), anchor: .center)
    }
}

private struct TourLayer: View {
    let tab: AppTab
    let anchors: [TourTarget: Anchor<CGRect>]
    private var tour: TourModel { TourModel.shared }

    var body: some View {
        if let step = tour.step, step.tab == tab, let index = tour.index {
            GeometryReader { proxy in
                let hole = step.target
                    .flatMap { anchors[$0] }
                    .map { proxy[$0].insetBy(dx: -8, dy: -8) }
                    .map { $0.intersection(CGRect(origin: .zero, size: proxy.size).insetBy(dx: 4, dy: 4)) }
                    .flatMap { $0.isNull || $0.height < 20 ? nil : $0 }

                ZStack(alignment: .topLeading) {
                    Path { path in
                        path.addRect(CGRect(origin: .zero, size: proxy.size))
                        if let hole {
                            path.addRoundedRect(in: hole, cornerSize: CGSize(width: 18, height: 18))
                        }
                    }
                    .fill(Color.black.opacity(0.62), style: FillStyle(eoFill: true))
                    .contentShape(Rectangle())
                    .onTapGesture {}

                    if let hole {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(Theme.accentSoft, lineWidth: 2.5)
                            .frame(width: hole.width, height: hole.height)
                            .offset(x: hole.minX, y: hole.minY)
                            .allowsHitTesting(false)
                    }

                    let top = topPadding(hole, in: proxy.size)
                    let bottom = bottomPadding(hole, in: proxy.size)

                    bubble(step: step, index: index)
                        .padding(.horizontal, 16)
                        .frame(
                            width: proxy.size.width,
                            height: max(proxy.size.height - top - bottom, 0),
                            alignment: bubbleAlignment(hole, in: proxy.size)
                        )
                        .offset(y: top)
                }
            }
            .transition(.opacity)
        }
    }

    // Below the highlighted thing when it is in the upper part, else above.
    private func bubbleAlignment(_ hole: CGRect?, in size: CGSize) -> Alignment {
        guard let hole else { return .center }
        return hole.midY < size.height * 0.5 ? .top : .bottom
    }

    private func topPadding(_ hole: CGRect?, in size: CGSize) -> CGFloat {
        guard let hole, hole.midY < size.height * 0.5 else { return 0 }
        return min(hole.maxY + 12, size.height - 240)
    }

    private func bottomPadding(_ hole: CGRect?, in size: CGSize) -> CGFloat {
        guard let hole, hole.midY >= size.height * 0.5 else { return 0 }
        return min(size.height - hole.minY + 12, size.height - 240)
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
