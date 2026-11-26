import ActivityKit
import Foundation

// The countdown to the dancer's own lesson on the lock screen and in the
// Dynamic Island. The web starts it through Apple an hour before the lesson
// (push-to-start), so the names here must stay as the relay sends them
// (nas/push-relay/relay/server.mjs: "attributes-type", "attributes").
struct LessonActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: String
    }

    // The schedule's title ("Externí trenér").
    var title: String
    // "10:00–10:45"
    var time: String
    // Unix seconds.
    var startsAt: Double
    var endsAt: Double

    var startDate: Date { Date(timeIntervalSince1970: startsAt) }
    var endDate: Date { Date(timeIntervalSince1970: endsAt) }
}
