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

/// Allocates small, JSON-safe touch ids.
///
/// `ObjectIdentifier.hashValue` is a 64-bit pointer hash that loses precision
/// when serialized to JS `number`, so began/ended ids stop matching and the web
/// classifier's `_activePencilIds` leaks — after the first Pencil stroke
/// `isPencilActive()` stays true forever and the UI appears frozen.
final class TouchIdAllocator {
  static let shared = TouchIdAllocator()

  private var map: [ObjectIdentifier: Int] = [:]
  private var nextId = 1

  func id(for touch: UITouch) -> Int {
    let key = ObjectIdentifier(touch)
    if let existing = map[key] {
      return existing
    }
    let id = nextId
    nextId += 1
    map[key] = id
    return id
  }

  func release(_ touch: UITouch) {
    map.removeValue(forKey: ObjectIdentifier(touch))
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
    identifier = TouchIdAllocator.shared.id(for: touch)
    kind = TouchKind(touchType: touch.type)
    self.phase = phase
    x = location.x
    y = location.y
    majorRadius = touch.majorRadius
    timestamp = touch.timestamp

    if phase == .ended || phase == .cancelled {
      TouchIdAllocator.shared.release(touch)
    }
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
