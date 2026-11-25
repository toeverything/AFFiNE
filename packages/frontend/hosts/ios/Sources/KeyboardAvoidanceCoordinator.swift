import QuartzCore
import UIKit

/// Observes UIKit keyboard frame notifications and samples non-double-counted keyboard
/// avoidance insets on every `CADisplayLink` tick through the Rust C ABI.
final class KeyboardAvoidanceCoordinator {
  weak var hostView: UIView?
  var hostHandle: OpaquePointer?
  var currentTimeProvider: () -> Double = { CACurrentMediaTime() }

  private(set) var lastMetrics = AffineKeyboardAvoidanceMetrics()
  private(set) var lastInsets = AffineWindowInsets(
    safe_top: 0,
    safe_right: 0,
    safe_bottom: 0,
    safe_left: 0,
    ime_bottom: 0
  )
  private var lastDisplayTimestamp: Double = 0
  private var observing = false

  func startObserving() {
    guard !observing else {
      return
    }
    observing = true
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(handleKeyboardWillChangeFrame(_:)),
      name: UIResponder.keyboardWillChangeFrameNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleKeyboardWillHide(_:)),
      name: UIResponder.keyboardWillHideNotification,
      object: nil
    )
  }

  func stopObserving() {
    guard observing else {
      return
    }
    observing = false
    NotificationCenter.default.removeObserver(self)
  }

  deinit {
    stopObserving()
  }

  /// Sample the current eased keyboard avoidance height on each `CADisplayLink` tick.
  @discardableResult
  func sampleDisplayLinkFrame(
    timestamp: Double,
    safeAreaInsets: UIEdgeInsets
  ) -> AffineWindowInsets {
    lastDisplayTimestamp = timestamp
    guard let handle = hostHandle else {
      return lastInsets
    }
    let next = affine_ios_host_sample_keyboard_frame(
      handle,
      Float(safeAreaInsets.top),
      Float(safeAreaInsets.right),
      Float(safeAreaInsets.bottom),
      Float(safeAreaInsets.left),
      timestamp
    )
    lastInsets = next
    return next
  }

  /// Deterministic entry point for evaluating a keyboard frame change against window bounds.
  @discardableResult
  func applyKeyboardFrame(
    windowBounds: CGRect,
    keyboardFrameInView: CGRect,
    safeAreaInsets: UIEdgeInsets,
    isHidden: Bool,
    durationSec: Double,
    timestampSec: Double
  ) -> AffineKeyboardAvoidanceMetrics {
    lastDisplayTimestamp = timestampSec
    let cWindow = AffineRect(
      x: Float(windowBounds.origin.x),
      y: Float(windowBounds.origin.y),
      width: Float(windowBounds.size.width),
      height: Float(windowBounds.size.height)
    )
    let cKeyboard = AffineRect(
      x: Float(keyboardFrameInView.origin.x),
      y: Float(keyboardFrameInView.origin.y),
      width: Float(keyboardFrameInView.size.width),
      height: Float(keyboardFrameInView.size.height)
    )
    let metrics = affine_ios_keyboard_compute_avoidance(
      cWindow,
      cKeyboard,
      Float(safeAreaInsets.bottom),
      isHidden
    )
    lastMetrics = metrics

    if let handle = hostHandle {
      affine_ios_host_begin_keyboard_transition(
        handle,
        metrics.ime_bottom_pt,
        timestampSec,
        durationSec
      )
      lastInsets = affine_ios_host_sample_keyboard_frame(
        handle,
        Float(safeAreaInsets.top),
        Float(safeAreaInsets.right),
        Float(safeAreaInsets.bottom),
        Float(safeAreaInsets.left),
        timestampSec
      )
    }
    return metrics
  }

  @objc private func handleKeyboardWillChangeFrame(_ notification: Notification) {
    handleKeyboardNotification(notification, isHidden: false)
  }

  @objc private func handleKeyboardWillHide(_ notification: Notification) {
    handleKeyboardNotification(notification, isHidden: true)
  }

  private func handleKeyboardNotification(_ notification: Notification, isHidden: Bool) {
    guard
      let view = hostView,
      let userInfo = notification.userInfo,
      let endFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
    else {
      return
    }
    let duration = (userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
    let converted: CGRect
    if let window = view.window {
      converted = view.convert(endFrame, from: window.screen.coordinateSpace)
    } else {
      converted = view.convert(endFrame, from: nil)
    }
    // Always sample fresh monotonic media time so resuming after background suspension
    // never reuses a stale pre-background `CADisplayLink` timestamp and skips animation frames.
    let nowTs = currentTimeProvider()
    _ = applyKeyboardFrame(
      windowBounds: view.bounds,
      keyboardFrameInView: converted,
      safeAreaInsets: view.safeAreaInsets,
      isHidden: isHidden,
      durationSec: duration,
      timestampSec: nowTs
    )
  }
}
