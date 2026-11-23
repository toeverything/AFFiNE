import AffinePaywall
import Capacitor
import Foundation
import SwiftUI
import UIKit

@objc(PayWallPlugin)
public class PayWallPlugin: CAPPlugin, CAPBridgedPlugin {
  init(
    associatedController: UIViewController?
  ) {
    controller = associatedController
    super.init()
  }

  weak var controller: UIViewController?

  public let identifier = "PayWallPlugin"
  public let jsName = "PayWall"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "showPayWall", returnType: CAPPluginReturnPromise),
  ]

  @objc func showPayWall(_ call: CAPPluginCall) {
    Task { @MainActor [weak self] in
      guard let self else {
        call.resolve(["success": false])
        return
      }

      do {
        let type = try call.getStringEnsure("type")
        let presentingController = try controller.get()
        let webView = try self.webView.get("AFFiNE is still loading. Please try again in a moment.")
        let initialPlan = paywallPlan(for: type)

        let isSignedIn = try await PaywallAuthGuard.ensureSignedIn(using: webView)
        guard isSignedIn else {
          call.resolve(["success": false, "type": type])
          return
        }

        let paywallController = AppPaywallViewController()
        paywallController.initialPlan = initialPlan
        paywallController.bindWebView = webView
        paywallController.modalPresentationStyle = .fullScreen
        paywallController.modalTransitionStyle = .coverVertical
        presentingController.present(paywallController, animated: true)

        call.resolve(["success": true, "type": type])
      } catch {
        call.reject("failed to show paywall", nil, error)
      }
    }
  }

  private func paywallPlan(for type: String) -> AppPaywallPlan {
    switch type.lowercased() {
    case "lite":
      .lite
    case "ai":
      .ai
    default:
      .pro
    }
  }
}
