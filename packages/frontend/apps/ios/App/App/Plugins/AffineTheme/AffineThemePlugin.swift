import Capacitor
import UIKit

protocol AffineThemeConfigurable: AnyObject {
  var appThemeUserInterfaceStyle: UIUserInterfaceStyle { get set }
}

enum AffineThemeStorage {
  static let modeKey = "affine.theme.mode"
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

    let cachedMode = AffineThemeMode(rawValue: UserDefaults.standard.string(forKey: AffineThemeStorage.modeKey) ?? "") ?? .system
    (associatedController as? AffineThemeConfigurable)?.appThemeUserInterfaceStyle = cachedMode.userInterfaceStyle
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
      UserDefaults.standard.set(themeMode.rawValue, forKey: AffineThemeStorage.modeKey)
      (self.controller as? AffineThemeConfigurable)?.appThemeUserInterfaceStyle = themeMode.userInterfaceStyle
      call.resolve()
    }
  }
}
