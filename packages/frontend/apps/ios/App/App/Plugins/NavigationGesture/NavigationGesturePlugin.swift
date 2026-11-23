import Capacitor
import Foundation
import UIKit

@objc(NavigationGesturePlugin)
public class NavigationGesturePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "NavigationGesturePlugin"
  public let jsName = "NavigationGesture"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
  ]
  private var edgePan: UIScreenEdgePanGestureRecognizer?

  public override func load() {
    guard let webView = bridge?.webView else { return }
    let recognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgePan(_:)))
    recognizer.edges = .left
    recognizer.isEnabled = false
    webView.addGestureRecognizer(recognizer)
    edgePan = recognizer
  }

  @objc func isEnabled(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      let enabled = self.edgePan?.isEnabled ?? false
      call.resolve(["value": enabled])
    }
  }

  @objc func enable(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      self.edgePan?.isEnabled = true
      call.resolve([:])
    }
  }

  @objc func disable(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      self.edgePan?.isEnabled = false
      call.resolve([:])
    }
  }

  @objc private func handleEdgePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
    guard let view = recognizer.view else { return }
    let progress = min(1, max(0, recognizer.translation(in: view).x / max(1, view.bounds.width)))
    switch recognizer.state {
    case .began:
      notifyListeners("gesture", data: ["phase": "begin", "progress": progress])
    case .changed:
      notifyListeners("gesture", data: ["phase": "progress", "progress": progress])
    case .ended:
      let velocity = recognizer.velocity(in: view).x
      let phase = progress >= 0.35 || velocity >= 500 ? "commit" : "cancel"
      notifyListeners("gesture", data: ["phase": phase, "progress": progress])
    case .cancelled, .failed:
      notifyListeners("gesture", data: ["phase": "cancel", "progress": progress])
    default:
      break
    }
  }
}
