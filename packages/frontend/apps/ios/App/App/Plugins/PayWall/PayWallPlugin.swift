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
    Paywall.setup()
  }

  weak var controller: UIViewController?

  public let identifier = "PayWallPlugin"
  public let jsName = "PayWall"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "showPayWall", returnType: CAPPluginReturnPromise),
  ]

  @objc func showPayWall(_ call: CAPPluginCall) {
    do {
      let type = try call.getStringEnsure("type")
      let controller = try controller.get()

      // TODO: GET TO KNOW THE PAYWALL TYPE
      print("[*] showing paywall of type: \(type)")
      DispatchQueue.main.async {
        Paywall.presentWall(
          toController: controller,
          bindWebContext: self.webView,
          type: type
        )
      }

      call.resolve(["success": true, "type": type])
    } catch {
      call.reject("failed to show paywall", nil, error)
    }
  }
}
