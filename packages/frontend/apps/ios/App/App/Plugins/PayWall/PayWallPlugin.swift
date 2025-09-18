import Capacitor
import Foundation

@objc(PayWallPlugin)
public class PayWallPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PayWallPlugin"
  public let jsName = "PayWall"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "showPayWall", returnType: CAPPluginReturnPromise),
  ]

  @objc func showPayWall(_ call: CAPPluginCall) {
    do {
      let type = try call.getStringEnsure("type")

      // TODO: Implement actual paywall logic here
      // For now, just log the type and resolve
      print("PayWall: Showing paywall of type: \(type)")

      call.resolve(["success": true, "type": type])
    } catch {
      call.reject("Failed to show paywall", nil, error)
    }
  }
}