import ActivityKit
import SwiftUI
import WidgetKit

@main
struct KoskoviWidgets: WidgetBundle {
    var body: some Widget {
        LessonActivityWidget()
    }
}

private enum Brand {
    static let background = Color(red: 0, green: 0.216, blue: 0.345)
    static let accent = Color(red: 0.0, green: 0.62, blue: 0.86)
    static let soft = Color(red: 0.71, green: 0.87, blue: 0.96)
}

// Time left until the lesson starts ("12:34"); 0:00 once it has started.
private struct Countdown: View {
    let to: Date

    var body: some View {
        Text(timerInterval: to.addingTimeInterval(-24 * 60 * 60)...to, countsDown: true)
            .monospacedDigit()
    }
}

struct LessonActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LessonActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes)
                .activityBackgroundTint(Brand.background)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Lekce", systemImage: "figure.dance")
                        .font(.headline)
                        .foregroundStyle(Brand.soft)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(to: context.attributes.startDate)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 110, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.attributes.time) · \(context.attributes.title)")
                        .font(.subheadline)
                        .foregroundStyle(Brand.soft)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "figure.dance")
                    .foregroundStyle(Brand.accent)
            } compactTrailing: {
                Countdown(to: context.attributes.startDate)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.soft)
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "figure.dance")
                    .foregroundStyle(Brand.accent)
            }
            .keylineTint(Brand.accent)
        }
    }
}

private struct LockScreenView: View {
    let attributes: LessonActivityAttributes

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "figure.dance")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(Circle().fill(Brand.accent))
            VStack(alignment: .leading, spacing: 2) {
                Text("Tvoje lekce")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.soft)
                Text(attributes.time)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text(attributes.title)
                    .font(.caption)
                    .foregroundStyle(Brand.soft)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text("začíná za")
                    .font(.caption)
                    .foregroundStyle(Brand.soft)
                Countdown(to: attributes.startDate)
                    .font(.title.weight(.heavy))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 120, alignment: .trailing)
            }
        }
        .padding(16)
    }
}
