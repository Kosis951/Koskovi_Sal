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

            AccountScreen()
                .tabItem { Label("Účet", systemImage: "person.crop.circle") }
                .tag(AppTab.account)
        }
        .task { await schedule.load() }
        // A schedule published while the app was away shows its tab without a restart.
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Task { await schedule.load() }
            }
        }
    }
}
