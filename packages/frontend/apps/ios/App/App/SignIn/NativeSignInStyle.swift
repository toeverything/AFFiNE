import SwiftUI
import UIKit

enum NativeSignInAppearanceSetting: String {
  case system
  case light
  case dark
}

struct NativeSignInAppearanceSnapshot {
  let setting: NativeSignInAppearanceSetting
  let resolvedScheme: ColorScheme

  init(setting: NativeSignInAppearanceSetting, resolvedScheme: ColorScheme) {
    self.setting = setting
    self.resolvedScheme = resolvedScheme
  }

  init(systemInterfaceStyle: UIUserInterfaceStyle) {
    setting = .system
    resolvedScheme = systemInterfaceStyle == .dark ? .dark : .light
  }

  init(cachedSystemInterfaceStyle systemInterfaceStyle: UIUserInterfaceStyle) {
    let cachedSetting = NativeSignInAppearanceSetting(rawValue: UserDefaults.standard.string(forKey: AffineThemeStorage.modeKey) ?? "") ?? .system
    setting = cachedSetting
    switch cachedSetting {
    case .dark:
      resolvedScheme = .dark
    case .light:
      resolvedScheme = .light
    case .system:
      resolvedScheme = systemInterfaceStyle == .dark ? .dark : .light
    }
  }

  func effectiveScheme(systemScheme: ColorScheme) -> ColorScheme {
    setting == .system ? systemScheme : resolvedScheme
  }

  var preferredColorScheme: ColorScheme? {
    switch setting {
    case .system:
      return nil
    case .light:
      return .light
    case .dark:
      return .dark
    }
  }
}

struct NativeSignInPalette {
  let colorScheme: ColorScheme

  private var isDark: Bool {
    colorScheme == .dark
  }

  var usesDarkStyle: Bool {
    isDark
  }

  var background: Color {
    isDark ? Color(red: 0.30, green: 0.30, blue: 0.30) : Color(red: 0.95, green: 0.95, blue: 0.95)
  }

  var backgroundOverlay: Color {
    isDark ? Color.black.opacity(0.34) : Color.white.opacity(0.02)
  }

  var backgroundImageOpacity: Double {
    isDark ? 0.68 : 1
  }

  var dotColor: Color {
    isDark ? Color.white.opacity(0.12) : Color.clear
  }

  var logoTint: Color {
    isDark ? Color.white.opacity(0.94) : Color(red: 0.12, green: 0.12, blue: 0.12)
  }

  var primaryText: Color {
    isDark ? Color(red: 0.95, green: 0.95, blue: 0.96) : Color(red: 0.12, green: 0.12, blue: 0.12)
  }

  var secondaryText: Color {
    isDark ? Color(red: 0.72, green: 0.72, blue: 0.74) : Color(red: 0.22, green: 0.22, blue: 0.22)
  }

  var placeholderText: Color {
    isDark ? Color.white.opacity(0.58) : Color(red: 0.55, green: 0.55, blue: 0.55)
  }

  var tertiaryText: Color {
    isDark ? Color(red: 0.62, green: 0.62, blue: 0.64) : Color(red: 0.55, green: 0.55, blue: 0.55)
  }

  var inputBackground: Color {
    isDark ? Color(red: 0.25, green: 0.25, blue: 0.25) : Color(red: 0.88, green: 0.88, blue: 0.88)
  }

  var readonlyInputBackground: Color {
    isDark ? Color(red: 0.22, green: 0.22, blue: 0.22) : Color(red: 0.90, green: 0.90, blue: 0.90)
  }

  var divider: Color {
    isDark ? Color.white.opacity(0.12) : Color(red: 0.86, green: 0.86, blue: 0.86)
  }

  var accent: Color {
    isDark ? Color(red: 0.43, green: 0.78, blue: 1.0) : Color(red: 0.0, green: 0.43, blue: 1.0)
  }

  var successText: Color {
    isDark ? Color(red: 0.44, green: 0.86, blue: 0.57) : Color(red: 0.10, green: 0.58, blue: 0.25)
  }

  var hudBackground: Color {
    isDark ? Color.white.opacity(0.10) : Color.white.opacity(0.72)
  }

  var hudBorder: Color {
    isDark ? Color.white.opacity(0.16) : Color.white.opacity(0.86)
  }

  var hudIconBackground: Color {
    isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
  }

  var hudLoadingTrack: Color {
    isDark ? Color.white.opacity(0.13) : Color.black.opacity(0.07)
  }

  var hudGradientEnd: Color {
    isDark ? Color(red: 0.68, green: 0.45, blue: 1.0) : Color(red: 0.62, green: 0.30, blue: 0.96)
  }

  var hudShadow: Color {
    isDark ? Color.black.opacity(0.32) : Color.black.opacity(0.14)
  }

  var closeIcon: Color {
    isDark ? Color.white.opacity(0.92) : Color(red: 0.18, green: 0.18, blue: 0.18)
  }

  var closeButtonBackground: Color {
    isDark ? Color(red: 0.16, green: 0.16, blue: 0.16).opacity(0.92) : Color.white.opacity(0.94)
  }

  var closeButtonCornerRadius: CGFloat {
    isDark ? 13 : 22
  }

  var controlShadow: Color {
    isDark ? Color.black.opacity(0.10) : Color.black.opacity(0.08)
  }

  var inputCornerRadius: CGFloat {
    isDark ? 6 : 10
  }

  var inputHeight: CGFloat {
    isDark ? 44 : 47
  }

  var authButtonHeight: CGFloat {
    isDark ? 44 : 52
  }

  var emailButtonHeight: CGFloat {
    isDark ? 44 : 50
  }

  var authButtonCornerRadius: CGFloat {
    isDark ? 7 : 26
  }

  var emailButtonCornerRadius: CGFloat {
    isDark ? 7 : 25
  }

  var emailButtonBackground: Color {
    isDark ? Color(red: 0.28, green: 0.28, blue: 0.28) : Color.white.opacity(0.96)
  }

  var emailButtonText: Color {
    isDark ? Color.white.opacity(0.92) : Color(red: 0.10, green: 0.10, blue: 0.10)
  }

  var googleButtonBackground: Color {
    Color(red: 0.11, green: 0.58, blue: 0.91)
  }

  var appleButtonBackground: Color {
    isDark ? Color.black.opacity(0.05) : Color.black
  }

  var appleButtonForeground: Color {
    Color.white
  }

  var appleButtonBorder: Color {
    isDark ? Color.white.opacity(0.82) : Color.clear
  }

  var appleButtonBorderWidth: CGFloat {
    isDark ? 1 : 0
  }

  var primaryDisabledBackground: Color {
    isDark ? Color(red: 0.28, green: 0.28, blue: 0.28) : Color.gray.opacity(0.5)
  }

  var legalFrameAlignment: Alignment {
    isDark ? .leading : .center
  }

  var legalTextAlignment: TextAlignment {
    isDark ? .leading : .center
  }
}

