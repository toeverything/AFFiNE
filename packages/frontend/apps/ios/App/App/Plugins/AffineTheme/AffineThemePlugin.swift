import Capacitor
import UIKit

protocol AffineThemeConfigurable: AnyObject {
  var appThemeUserInterfaceStyle: UIUserInterfaceStyle { get set }
}

private enum AffineThemeMode: String {
  case dark
  case light
  case system

  var userInterfaceStyle: UIUserInterfaceStyle {
    switch self {
    case .dark:
      .dark
    case .light:
      .light
    case .system:
      .unspecified
    }
  }
}

@objc(AffineThemePlugin)
public final class AffineThemePlugin: CAPPlugin, CAPBridgedPlugin {
  init(associatedController: UIViewController?) {
    controller = associatedController
    super.init()
  }

  weak var controller: UIViewController?

  public let identifier = "AffineThemePlugin"
  public let jsName = "AffineTheme"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "onThemeChanged", returnType: CAPPluginReturnPromise),
  ]

  @objc func onThemeChanged(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      let themeMode = AffineThemeMode(rawValue: call.getString("themeMode") ?? "") ?? .system
      (self.controller as? AffineThemeConfigurable)?.appThemeUserInterfaceStyle = themeMode.userInterfaceStyle
      call.resolve()
    }
  }
}
