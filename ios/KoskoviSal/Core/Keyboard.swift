import UIKit

// The keyboard goes away when tapping anywhere outside a text field, when
// switching tabs and when a pop-up window closes, so it never stays up over
// a screen with nothing to type into.
@MainActor
enum Keyboard {
    static func hide() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    // One tap recogniser on each window; it lets the tap through to buttons
    // and lists (cancelsTouchesInView = false).
    static func installTapToHide() {
        for scene in UIApplication.shared.connectedScenes {
            guard let scene = scene as? UIWindowScene else { continue }

            for window in scene.windows where !(window.gestureRecognizers ?? []).contains(where: { $0 is HideKeyboardTap }) {
                window.addGestureRecognizer(HideKeyboardTap())
            }
        }
    }
}

private final class HideKeyboardTap: UITapGestureRecognizer {
    private static let delegateObject = Delegate()

    init() {
        super.init(target: nil, action: nil)
        addTarget(self, action: #selector(fire))
        cancelsTouchesInView = false
        delegate = Self.delegateObject
    }

    @objc private func fire() {
        view?.endEditing(true)
    }

    @MainActor
    final class Delegate: NSObject, UIGestureRecognizerDelegate {
        // A tap into a text field (or its clear button) keeps the keyboard.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view

            while let current = view {
                if current is UITextField || current is UITextView {
                    return false
                }
                view = current.superview
            }

            return true
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
