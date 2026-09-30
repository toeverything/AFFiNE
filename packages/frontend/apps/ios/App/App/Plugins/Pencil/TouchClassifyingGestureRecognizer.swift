import UIKit
import UIKit.UIGestureRecognizerSubclass

/// A passive gesture recognizer that reports the native classification of every
/// touch without ever consuming it.
///
/// It stays in `.possible` for its whole lifetime and sets `cancelsTouchesInView`
/// to false, so touches continue to flow to the WKWebView untouched. Its only job
/// is to read `UITouch.type` and contact geometry — information WKWebView does not
/// forward to the Web `PointerEvent` layer — and hand it upward.
final class TouchClassifyingGestureRecognizer: UIGestureRecognizer, UIGestureRecognizerDelegate {
  private let onTouches: ([ClassifiedTouch]) -> Void

  init(onTouches: @escaping ([ClassifiedTouch]) -> Void) {
    self.onTouches = onTouches
    super.init(target: nil, action: nil)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
    delegate = self
  }

  private func report(_ touches: Set<UITouch>, phase: TouchPhase) {
    guard let view else { return }
    let classified = touches.map { ClassifiedTouch(touch: $0, phase: phase, in: view) }
    onTouches(classified)
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    report(touches, phase: .began)
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    report(touches, phase: .ended)
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    report(touches, phase: .cancelled)
  }

  // MARK: - UIGestureRecognizerDelegate

  // Recognize alongside every other recognizer so we never win/steal the touch.
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }
}
