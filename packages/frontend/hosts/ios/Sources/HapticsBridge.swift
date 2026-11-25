import Foundation
import UIKit

enum AffineHapticPatternSwift: UInt8, CaseIterable, Equatable {
  case lightImpact = 0
  case mediumImpact = 1
  case heavyImpact = 2
  case selectionChanged = 3
  case success = 4
  case warning = 5
  case error = 6
}

/// Bridges Rust haptic pattern triggers to UIKit feedback generators with pre-warming
/// and main-thread-safe dispatch.
final class HapticsBridge {
  static let maxRecordedPatterns = 64

  private let lock = NSLock()
  private var recordedPatterns: [AffineHapticPatternSwift] = []

  private var lightGenerator: UIImpactFeedbackGenerator?
  private var mediumGenerator: UIImpactFeedbackGenerator?
  private var heavyGenerator: UIImpactFeedbackGenerator?
  private var selectionGenerator: UISelectionFeedbackGenerator?
  private var notificationGenerator: UINotificationFeedbackGenerator?

  var dispatchedPatterns: [AffineHapticPatternSwift] {
    lock.lock()
    defer { lock.unlock() }
    return recordedPatterns
  }

  func resetDispatchedPatterns() {
    lock.lock()
    recordedPatterns.removeAll()
    lock.unlock()
  }

  func prepareAll() {
    dispatchOnMain {
      self.ensureGeneratorsOnMain()
      self.lightGenerator?.prepare()
      self.mediumGenerator?.prepare()
      self.heavyGenerator?.prepare()
      self.selectionGenerator?.prepare()
      self.notificationGenerator?.prepare()
    }
  }

  func trigger(_ pattern: AffineHapticPatternSwift) {
    lock.lock()
    if recordedPatterns.count >= Self.maxRecordedPatterns {
      recordedPatterns.removeFirst(recordedPatterns.count - Self.maxRecordedPatterns + 1)
    }
    recordedPatterns.append(pattern)
    lock.unlock()

    dispatchOnMain {
      self.ensureGeneratorsOnMain()
      switch pattern {
      case .lightImpact:
        self.lightGenerator?.impactOccurred()
        self.lightGenerator?.prepare()
      case .mediumImpact:
        self.mediumGenerator?.impactOccurred()
        self.mediumGenerator?.prepare()
      case .heavyImpact:
        self.heavyGenerator?.impactOccurred()
        self.heavyGenerator?.prepare()
      case .selectionChanged:
        self.selectionGenerator?.selectionChanged()
        self.selectionGenerator?.prepare()
      case .success:
        self.notificationGenerator?.notificationOccurred(.success)
        self.notificationGenerator?.prepare()
      case .warning:
        self.notificationGenerator?.notificationOccurred(.warning)
        self.notificationGenerator?.prepare()
      case .error:
        self.notificationGenerator?.notificationOccurred(.error)
        self.notificationGenerator?.prepare()
      }
    }
  }

  func attach(to host: OpaquePointer) {
    let userData = Unmanaged.passUnretained(self).toOpaque()
    affine_ios_host_set_haptics_callback(
      host,
      { rawPattern, ctx in
        guard
          let ctx,
          let pattern = AffineHapticPatternSwift(rawValue: rawPattern)
        else {
          return
        }
        let bridge = Unmanaged<HapticsBridge>.fromOpaque(ctx).takeUnretainedValue()
        bridge.trigger(pattern)
      },
      userData
    )
  }

  func detach(from host: OpaquePointer) {
    affine_ios_host_set_haptics_callback(host, nil, nil)
  }

  private func dispatchOnMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func ensureGeneratorsOnMain() {
    if lightGenerator == nil {
      lightGenerator = UIImpactFeedbackGenerator(style: .light)
    }
    if mediumGenerator == nil {
      mediumGenerator = UIImpactFeedbackGenerator(style: .medium)
    }
    if heavyGenerator == nil {
      heavyGenerator = UIImpactFeedbackGenerator(style: .heavy)
    }
    if selectionGenerator == nil {
      selectionGenerator = UISelectionFeedbackGenerator()
    }
    if notificationGenerator == nil {
      notificationGenerator = UINotificationFeedbackGenerator()
    }
  }
}
