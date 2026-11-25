import Foundation
import Observation
import UIKit
import UserNotifications

// What the device is subscribed to, as on the web: "hall" (the hall is taken
// today, trainings cancelled) and "cleanup" (the hall waits for cleanup).
enum PushTopic: String, CaseIterable, Identifiable {
    case hall, cleanup

    var id: String { rawValue }

    var title: String {
        switch self {
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

        do {
            _ = try await API.send(
                "POST",
                "/api/push/native",
                body: [
                    "platform": "ios",
                    "test": test,
                    "token": token,
                    "topics": topics.map(\.rawValue),
                ],
                as: Empty.self
            )
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
