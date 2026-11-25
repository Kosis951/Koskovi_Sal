import SwiftUI

// The club's colours, as on the web.
enum Theme {
    static let brand = Color(red: 0 / 255, green: 55 / 255, blue: 88 / 255)
    static let accent = Color(red: 0 / 255, green: 143 / 255, blue: 204 / 255)
    static let gradient = LinearGradient(
        colors: [brand, Color(red: 1 / 255, green: 77 / 255, blue: 118 / 255), accent],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let training = Color(red: 0.56, green: 0.80, blue: 0.94)
    static let event = Color(red: 0.55, green: 0.50, blue: 0.86)
    static let busy = Color(red: 0.90, green: 0.45, blue: 0.36)
    static let cleanup = Color(red: 0.88, green: 0.71, blue: 0.33)
    static let free = Color.green

    static func color(for booking: Booking) -> Color {
        if booking.isTraining { return training }
        return booking.isBusy ? busy : event
    }
}

// A coloured bar on the left of a calendar row.
struct KindBar: View {
    let color: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 4)
    }
}

struct ErrorBanner: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
