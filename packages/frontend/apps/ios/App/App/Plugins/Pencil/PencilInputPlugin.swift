import Capacitor
import Foundation
import OSLog
import UIKit

private let pencilLog = Logger(subsystem: "app.affine.pro", category: "pencil")

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
/// This plugin is observation-only: it never consumes touches, so existing
/// WKWebView and blocksuite gesture handling is unaffected.
@objc(PencilInputPlugin)
public class PencilInputPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PencilInputPlugin"
  public let jsName = "PencilInput"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isObserving", returnType: CAPPluginReturnPromise),
  ]

  private weak var recognizer: TouchClassifyingGestureRecognizer?

  @objc func start(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
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
      pencilLog.warning("affine-pencil \(summary, privacy: .public)")
    }
    notifyListeners("touchClassified", data: ["touches": payload])
  }
}
