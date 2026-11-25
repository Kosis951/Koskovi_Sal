import SwiftUI
import UIKit

// The web's colours (src/app/globals.css), light and dark.
extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

// A calendar item's look: background, text and border.
struct KindStyle {
    let background: Color
    let ink: Color
    let line: Color
}

enum Theme {
    static let page = Color(light: 0xF3F7FA, dark: 0x071621)
    static let surface = Color(light: 0xFFFFFF, dark: 0x0E2230)
    static let subtle = Color(light: 0xEEF4F8, dark: 0x142B3B)
    static let line = Color(light: 0xDBE6EE, dark: 0x1E3A4E)
    static let ink = Color(light: 0x003758, dark: 0xEAF4FA)
    static let inkMuted = Color(light: 0x4F6B7E, dark: 0xA8C1D1)
    static let inkSoft = Color(light: 0x8198A8, dark: 0x7893A6)
    static let brand = Color(light: 0x003758, dark: 0x2A9FD8)
    static let accent = Color(light: 0x008FCC, dark: 0x1C9AD6)
    static let accentSoft = Color(light: 0xAFDFF9, dark: 0xAFDFF9)
    static let now = Color(light: 0xD64534, dark: 0xFF7A66)

    static let gradient = LinearGradient(
        colors: [
            Color(light: 0x003758, dark: 0x021520),
            Color(light: 0x014D76, dark: 0x06314D),
            Color(light: 0x008FCC, dark: 0x0A5A85),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let training = KindStyle(
        background: Color(light: 0xE2F3FD, dark: 0x113A55),
        ink: Color(light: 0x003758, dark: 0xD5EEFC),
        line: Color(light: 0x8FCDEF, dark: 0x2F6F98)
    )
    static let event = KindStyle(
        background: Color(light: 0xEEECFB, dark: 0x2A2650),
        ink: Color(light: 0x3C3489, dark: 0xDCD8FF),
        line: Color(light: 0xB8B2EC, dark: 0x4F47A0)
    )
    static let busy = KindStyle(
        background: Color(light: 0xFDEBE5, dark: 0x3D2420),
        ink: Color(light: 0x8C2F20, dark: 0xFFCFC2),
        line: Color(light: 0xEFB3A3, dark: 0x8A4535)
    )
    static let cleanup = KindStyle(
        background: Color(light: 0xFFF3D1, dark: 0x3A2F12),
        ink: Color(light: 0x6A4B00, dark: 0xF7DC97),
        line: Color(light: 0xE1B554, dark: 0x8A6A1F)
    )
    static let free = KindStyle(
        background: Color(light: 0xEAF6EE, dark: 0x1A2E22),
        ink: Color(light: 0x1F6040, dark: 0x9FDCB6),
        line: Color(light: 0xA9D8B9, dark: 0x2F6B47)
    )
    static let closed = KindStyle(
        background: Color(light: 0xE7EDF2, dark: 0x0A1A25),
        ink: Color(light: 0x4F6B7E, dark: 0xA8C1D1),
        line: Color(light: 0xD2DDE6, dark: 0x1B3448)
    )

    static func style(for booking: Booking) -> KindStyle {
        if booking.isTraining { return training }
        return booking.isBusy ? busy : event
    }
}

// --- Shared pieces ---

// The club's header: gradient, logo, title; reaches under the status bar.
struct BrandHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image("LogoMark")
                .resizable()
                .scaledToFit()
                .frame(width: 34, height: 30)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.title2.weight(.heavy))
                    .foregroundStyle(.white)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.accentSoft)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity)
        .background(Theme.gradient.ignoresSafeArea(edges: .top))
    }
}

extension BrandHeader where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle, trailing: { EmptyView() })
    }
}

// A round button for the header (white on the gradient).
struct HeaderButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(Circle().fill(.white.opacity(0.16)))
        }
        .accessibilityLabel(label)
    }
}

struct CardModifier: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View {
        modifier(CardModifier(padding: padding))
    }

    // The page behind cards.
    func pageBackground() -> some View {
        background(Theme.page.ignoresSafeArea())
    }
}

struct SectionTitle: View {
    let text: String
    var systemImage: String?

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
            }
            Text(text)
        }
        .font(.footnote.weight(.bold))
        .textCase(.uppercase)
        .foregroundStyle(Theme.inkMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(Theme.accent.opacity(isEnabled ? 1 : 0.45)))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.accent)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Capsule().stroke(Theme.accent, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// A small coloured label ("Čeká", "Potvrzená"…).
struct Badge: View {
    let text: String
    let style: KindStyle

    var body: some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(style.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(style.background))
            .overlay(Capsule().stroke(style.line, lineWidth: 1))
    }
}

struct ErrorBanner: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote.weight(.medium))
            .foregroundStyle(Theme.busy.ink)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.busy.background))
    }
}

struct NoticeBanner: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.footnote.weight(.medium))
            .foregroundStyle(Theme.free.ink)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.free.background))
    }
}

// A labelled text field in the app's style.
struct FieldBox<Content: View>: View {
    let label: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.inkMuted)
            content()
                .padding(.horizontal, 14)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.subtle))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line, lineWidth: 1))
        }
    }
}
