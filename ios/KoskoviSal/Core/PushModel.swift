import ActivityKit
import Foundation
import Observation
import UIKit
import UserNotifications

// What the device is subscribed to, as on the web: "hall" (the hall is taken
// today, trainings cancelled), "cleanup" (the hall waits for cleanup) and
// "lessons" (an hour before the account's own lesson in the schedule, with a
// countdown on the lock screen and in the Dynamic Island).
enum PushTopic: String, CaseIterable, Identifiable {
    case lessons, hall, cleanup

    var id: String { rawValue }

    var title: String {
        switch self {
        case .lessons: return "Moje lekce z rozpisu (hodinu předem)"
        case .hall: return "Obsazený sál a zrušené tréninky"
        case .cleanup: return "Sál čeká na úklid"
        }
    }
}

@MainActor
@Observable
final class PushModel {
    static let shared = PushModel()

    private struct Status: Decodable {
        let available: Bool?
        let subscribed: Bool
        let topics: [String]
    }

    private static let topicsKey = "push.topics"

    private(set) var token: String?
    // Apple's token for starting the lesson countdown from the server.
    private(set) var liveToken: String?
    private var isWatchingLiveToken = false
    private(set) var topics: Set<PushTopic>
    private(set) var isAuthorized = false
    private(set) var isBusy = false
    private(set) var isAvailable = true
    var message: String?

    private init() {
        let saved = UserDefaults.standard.stringArray(forKey: Self.topicsKey) ?? []
        topics = Demo.isOn ? [.hall] : Set(saved.compactMap(PushTopic.init(rawValue:)))
    }

    // On launch: when notifications are allowed, get a fresh token (Apple may
    // change it) and keep the server's topics in step.
    func registerIfAllowed() async {
        if Demo.isOn { return }

        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional

        if isAuthorized && !topics.isEmpty {
            UIApplication.shared.registerForRemoteNotifications()
        }

        watchLiveToken()
    }

    // The signed-in account changed: the server links the phone to it (for
    // reminders of the account's own lessons).
    func accountChanged() async {
        if token != nil && !topics.isEmpty {
            await sync(test: false)
        }
    }

    private func watchLiveToken() {
        guard #available(iOS 17.2, *), !isWatchingLiveToken else { return }
        isWatchingLiveToken = true

        Task {
            for await data in Activity<LessonActivityAttributes>.pushToStartTokenUpdates {
                let hex = data.map { String(format: "%02x", $0) }.joined()
                guard hex != liveToken else { continue }
                liveToken = hex
                if token != nil && topics.contains(.lessons) {
                    await sync(test: false)
                }
            }
        }
    }

    func didReceive(token: String) async {
        self.token = token
        await sync(test: false)
    }

    func set(_ topic: PushTopic, enabled: Bool) async {
        if enabled {
            topics.insert(topic)
        } else {
            topics.remove(topic)
        }

        UserDefaults.standard.set(topics.map(\.rawValue).sorted(), forKey: Self.topicsKey)

        if enabled && !isAuthorized {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            isAuthorized = granted

            if !granted {
                topics.remove(topic)
                UserDefaults.standard.set(topics.map(\.rawValue).sorted(), forKey: Self.topicsKey)
                message = "Upozornění jsou pro aplikaci vypnutá. Zapni je v Nastavení → TK Koškovi → Oznámení."
                return
            }
        }

        if token == nil {
            if !topics.isEmpty {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return
        }

        await sync(test: false)
    }

    func sendTest() async {
        await sync(test: true)
    }

    private func sync(test: Bool) async {
        guard let token else { return }

        isBusy = true
        defer { isBusy = false }

        var body: [String: Any] = [
            "platform": "ios",
            "test": test,
            "token": token,
            "topics": topics.map(\.rawValue),
        ]
        if let liveToken {
            body["liveToken"] = liveToken
        }

        do {
            _ = try await API.send("POST", "/api/push/native", body: body, as: Empty.self)
            isAvailable = true
            message = test ? "Zkušební upozornění je na cestě." : nil
        } catch {
            if case APIError.server(let text) = error, text.contains("nejsou na serveru zapnutá") {
                isAvailable = false
            }
            message = error.localizedDescription
        }
    }
}
