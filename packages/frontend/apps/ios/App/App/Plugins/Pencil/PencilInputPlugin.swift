import Capacitor
import Foundation
import OSLog
import UIKit
import WebKit

private let pencilLog = Logger(subsystem: "app.affine.pro", category: "pencil")

private func logPencil(_ message: String) {
  pencilLog.warning("\(message, privacy: .public)")
  NSLog("[affine-pencil] %@", message)
}

/// Bridges native `UITouch.TouchType` classification to the web layer so the
/// whiteboard can distinguish Apple Pencil from finger/palm input.
///
/// Motivation: WKWebView collapses every native touch into a Web `PointerEvent`
/// whose `pointerType` is only `pen` / `touch` / `mouse`. Palm contact is
/// reported as an ordinary `touch`, indistinguishable from a finger, and the
/// Pencil `pen` type is not always reliable. The full `UITouch.type` and contact
/// geometry only exist natively, so we observe them here and forward the raw
/// signals. The web layer owns the routing policy (draw / pan-zoom / discard).
///
/// The native touch recognizer path is intentionally opt-in only: on-device
/// testing showed it can leave WKWebView unresponsive after the first Pencil
/// stroke. The safe production path uses WebKit pointer activity plus DOM
/// textarea proxies instead.
@objc(PencilInputPlugin)
public class PencilInputPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PencilInputPlugin"
  public let jsName = "PencilInput"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isObserving", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "updateScribbleState", returnType: CAPPluginReturnPromise),
  ]

  private weak var recognizer: TouchClassifyingGestureRecognizer?
  private var scribbleCoordinator: Any?

  @objc func start(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard call.getBool("allowUnsafeNativeRecognizer") == true else {
        logPencil("affine-pencil native recognizer start blocked")
        call.resolve(["value": false, "disabled": true])
        return
      }
      guard let view = self.bridge?.webView else {
        call.reject("WebView is not available")
        return
      }
      if self.recognizer == nil {
        let recognizer = TouchClassifyingGestureRecognizer { [weak self] touches in
          self?.emit(touches)
        }
        view.addGestureRecognizer(recognizer)
        self.recognizer = recognizer
      }
      call.resolve(["value": true])
    }
  }

  @objc func stop(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      if let recognizer = self.recognizer {
        recognizer.view?.removeGestureRecognizer(recognizer)
        self.recognizer = nil
      }
      call.resolve(["value": true])
    }
  }

  @objc func isObserving(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      call.resolve(["value": self.recognizer != nil])
    }
  }

  @objc func updateScribbleState(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let view = self.bridge?.webView else {
        call.reject("WebView is not available")
        return
      }
      if #available(iOS 14.0, *) {
        let nativeInteractionEnabled = call.getBool("nativeInteractionEnabled") ?? true
        if !nativeInteractionEnabled {
          if let coordinator = self.scribbleCoordinator as? PencilScribbleCoordinator {
            coordinator.removeAll()
            self.scribbleCoordinator = nil
          }
          call.resolve(["value": true, "nativeInteractionEnabled": false])
          return
        }
        let coordinator = self.getScribbleCoordinator(for: view)
        let enabled = call.getBool("enabled") ?? false
        let rects = (call.getArray("rects") ?? []).compactMap { item -> CGRect? in
          guard
            let rect = item as? [String: Any],
            let x = Self.cgFloat(from: rect["x"]),
            let y = Self.cgFloat(from: rect["y"]),
            let width = Self.cgFloat(from: rect["width"]),
            let height = Self.cgFloat(from: rect["height"])
          else {
            return nil
          }
          return CGRect(x: x, y: y, width: width, height: height)
        }
        coordinator.update(enabled: enabled, rects: rects)
        call.resolve(["value": true])
      } else {
        call.resolve(["value": false])
      }
    }
  }

  private static func cgFloat(from value: Any?) -> CGFloat? {
    if let number = value as? NSNumber {
      return CGFloat(truncating: number)
    }
    if let double = value as? Double {
      return CGFloat(double)
    }
    if let int = value as? Int {
      return CGFloat(int)
    }
    return nil
  }

  @available(iOS 14.0, *)
  private func getScribbleCoordinator(for view: WKWebView) -> PencilScribbleCoordinator {
    if let coordinator = scribbleCoordinator as? PencilScribbleCoordinator {
      configureScribbleCoordinator(coordinator)
      coordinator.install(on: view, rootView: view)
      coordinator.installContentViews(in: view)
      return coordinator
    }
    let coordinator = PencilScribbleCoordinator()
    configureScribbleCoordinator(coordinator)
    coordinator.install(on: view, rootView: view)
    coordinator.installContentViews(in: view)
    scribbleCoordinator = coordinator
    return coordinator
  }

  @available(iOS 14.0, *)
  private func configureScribbleCoordinator(_ coordinator: PencilScribbleCoordinator) {
    coordinator.onWillBegin = { [weak self] point in
      self?.notifyListeners("scribbleWillBegin", data: [
        "x": point.x,
        "y": point.y,
      ])
    }
  }

  private func emit(_ touches: [ClassifiedTouch]) {
    guard !touches.isEmpty else { return }
    let payload = touches.map { $0.asDictionary }
    // Compact native breadcrumb for Pencil freeze joint-debugging.
    // Include finger began/ended too — after a "freeze", if native still sees
    // finger/pencil but the web pointer counters stall, WebKit stopped
    // delivering input to the page.
    if touches.contains(where: {
      ($0.kind == .pencil || $0.kind == .finger)
        && ($0.phase == .began || $0.phase == .ended || $0.phase == .cancelled)
    }) {
      let summary = touches.map { "\($0.kind.rawValue):\($0.phase.rawValue)" }.joined(separator: ",")
      // Use Logger so idevicesyslog captures it (stdout print is often dropped).
      logPencil("affine-pencil \(summary)")
    }
    notifyListeners("touchClassified", data: ["touches": payload])
  }
}

@available(iOS 14.0, *)
private final class PencilScribbleCoordinator: NSObject, UIScribbleInteractionDelegate {
  private let hitSlop: CGFloat = 12
  private var enabled = false
  private weak var rootView: UIView?
  private var interactions: [ObjectIdentifier: UIScribbleInteraction] = [:]
  private var rects: [CGRect] = []
  private var lastLoggedState = ""
  var onWillBegin: ((CGPoint) -> Void)?

  func install(on view: UIView, rootView: UIView) {
    self.rootView = rootView

    let id = ObjectIdentifier(view)
    guard interactions[id] == nil else {
      return
    }
    let interaction = UIScribbleInteraction(delegate: self)
    view.addInteraction(interaction)
    interactions[id] = interaction
    logPencil("affine-scribble installed view=\(String(describing: type(of: view)))")
  }

  func installContentViews(in webView: WKWebView) {
    for subview in webView.scrollView.subviews {
      let viewName = String(describing: type(of: subview))
      guard viewName.contains("WKContentView") else {
        continue
      }
      install(on: subview, rootView: webView)
    }
  }

  func removeAll() {
    interactions.forEach { _, interaction in
      interaction.view?.removeInteraction(interaction)
    }
    interactions.removeAll()
    rootView = nil
    rects = []
    lastLoggedState = ""
    logPencil("affine-scribble removed native interactions")
  }

  func update(enabled: Bool, rects: [CGRect]) {
    self.enabled = enabled
    self.rects = rects.filter { !$0.isEmpty && $0.width > 1 && $0.height > 1 }
    let state = "\(enabled):\(self.rects.count)"
    if state != lastLoggedState {
      lastLoggedState = state
      logPencil("affine-scribble state enabled=\(enabled) rects=\(self.rects.count)")
    }
  }

  func scribbleInteraction(
    _ interaction: UIScribbleInteraction,
    shouldBeginAt location: CGPoint
  ) -> Bool {
    let rootLocation = locationInRootView(location, from: interaction.view)
    let allowed = enabled && rects.contains { rect in
      rect.insetBy(dx: -hitSlop, dy: -hitSlop).contains(rootLocation)
    }
    logPencil(
      "affine-scribble begin allow=\(allowed) x=\(rootLocation.x) y=\(rootLocation.y) rects=\(self.rects.count)"
    )
    if allowed {
      onWillBegin?(rootLocation)
    }
    return allowed
  }

  func scribbleInteractionShouldDelayFocus(_ interaction: UIScribbleInteraction) -> Bool {
    false
  }

  private func locationInRootView(_ location: CGPoint, from sourceView: UIView?) -> CGPoint {
    guard
      let sourceView,
      let rootView,
      sourceView !== rootView
    else {
      return location
    }
    return rootView.convert(location, from: sourceView)
  }
}
