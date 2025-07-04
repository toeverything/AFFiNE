import Foundation

final class AppConfigManager {
  struct AppConfig: Decodable {
    let affineVersion: String
  }

  static var affineVersion: String?

  static func getAffineVersion() -> String {
    if affineVersion == nil {
      let file = Bundle(for: AppConfigManager.self).url(forResource: "capacitor.config", withExtension: "json")!
      let data = try! Data(contentsOf: file)
      let config = try! JSONDecoder().decode(AppConfig.self, from: data)
      affineVersion = config.affineVersion
    }

    return affineVersion!
  }
}
