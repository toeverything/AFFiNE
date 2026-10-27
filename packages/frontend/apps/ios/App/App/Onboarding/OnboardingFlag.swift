import Foundation

enum OnboardingFlag {
  private static let completedKey = "com.affine.onboarding.completed"

  static var isCompleted: Bool {
    UserDefaults.standard.bool(forKey: completedKey)
  }

  static func markCompleted() {
    UserDefaults.standard.set(true, forKey: completedKey)
  }

  #if DEBUG
    static func reset() {
      UserDefaults.standard.removeObject(forKey: completedKey)
    }
  #endif
}
