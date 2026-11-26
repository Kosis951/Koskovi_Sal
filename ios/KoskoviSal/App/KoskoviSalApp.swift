import SwiftUI

@main
struct KoskoviSalApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = SessionModel()
    @State private var push = PushModel.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(push)
                .tint(Theme.accent)
                .task { await session.refresh() }
        }
    }
}

enum AppTab: Hashable {
    case calendar, lessons, schedule, admin, account
}

struct RootView: View {
    @Environment(SessionModel.self) private var session
    @Environment(PushModel.self) private var push
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: AppTab = Demo.tab ?? .calendar
    @State private var schedule = ScheduleModel()

    var body: some View {
        TabView(selection: $tab) {
            CalendarScreen()
                .tabItem { Label("Kalendář", systemImage: "calendar") }
                .tag(AppTab.calendar)

            LessonsScreen()
                .tabItem { Label("Lekce", systemImage: "figure.dance") }
                .tag(AppTab.lessons)

            if schedule.isPublished {
                ScheduleScreen(model: schedule)
                    .tabItem { Label("Rozpis", systemImage: "list.bullet.rectangle") }
                    .tag(AppTab.schedule)
            }

            if session.role?.canManageBookings == true {
                AdminScreen()
                    .tabItem { Label("Správa", systemImage: "gearshape.2") }
                    .tag(AppTab.admin)
            }

            AccountScreen(hasSchedule: schedule.isPublished)
                .tabItem { Label("Účet", systemImage: "person.crop.circle") }
                .tag(AppTab.account)
        }
        .task { await schedule.load() }
        // Pulling any screen down also checks the account and whether the
        // visiting trainer's schedule was published (its tab shows up then).
        .environment(\.refreshApp, refreshApp)
        .onAppear(perform: Keyboard.installTapToHide)
        .onChange(of: tab) { Keyboard.hide() }
        // The phone's notifications follow the signed-in account (own lessons).
        .onChange(of: session.username) {
            Task { await push.accountChanged() }
        }
        // The guide switches the tabs as it goes.
        .onChange(of: TourModel.shared.index) {
            if let step = TourModel.shared.step {
                tab = step.tab
            }
        }
        // After registration, once the sign-in window has closed.
        .onChange(of: session.isSignedIn) {
            guard session.isSignedIn, TourModel.shared.startsAfterRegistration else { return }
            TourModel.shared.startsAfterRegistration = false
            Task {
                try? await Task.sleep(for: .seconds(1))
                TourModel.shared.start(hasSchedule: schedule.isPublished)
            }
        }
        // A schedule published while the app was away shows its tab without a restart.
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Keyboard.installTapToHide()
                Task { await schedule.load() }
            }
        }
    }

    private func refreshApp() async {
        async let account: Void = session.refresh()
        async let published: Void = schedule.load()
        _ = await (account, published)
    }
}

extension EnvironmentValues {
    @Entry var refreshApp: @MainActor () async -> Void = {}
}
