import UIKit

enum TouchPhase: String {
  case began
  case ended
  case cancelled
}

/// The kind of input, derived from `UITouch.TouchType`.
///
/// Note: iOS has no dedicated palm touch type. Palm contact arrives as `.direct`.
/// Palm rejection is therefore a policy decision left to the web layer
/// (pencil-priority + contact-size heuristic), which is why `majorRadius` is
/// forwarded alongside the kind.
enum TouchKind: String {
  case pencil
  case finger
  case indirect
  case unknown

  init(touchType: UITouch.TouchType) {
    switch touchType {
    case .pencil:
      self = .pencil
    case .direct:
      self = .finger
    case .indirect, .indirectPointer:
      self = .indirect
    @unknown default:
      self = .unknown
    }
  }
}

/// A single native touch snapshot, normalized into CSS-pixel coordinates that
/// line up with the web `PointerEvent` space (the WKWebView renders at
/// `initial-scale=1`, so UIKit points map 1:1 to CSS pixels).
struct ClassifiedTouch {
  let identifier: Int
  let kind: TouchKind
  let phase: TouchPhase
  let x: CGFloat
  let y: CGFloat
  let majorRadius: CGFloat
  let timestamp: TimeInterval

  init(touch: UITouch, phase: TouchPhase, in view: UIView) {
    let location = touch.location(in: view)
    identifier = ObjectIdentifier(touch).hashValue
    kind = TouchKind(touchType: touch.type)
    self.phase = phase
    x = location.x
    y = location.y
    majorRadius = touch.majorRadius
    timestamp = touch.timestamp
  }

  var asDictionary: [String: Any] {
    [
      "id": identifier,
      "kind": kind.rawValue,
      "phase": phase.rawValue,
      "x": x,
      "y": y,
      "majorRadius": majorRadius,
      "timestamp": timestamp,
    ]
  }
}
