import UIKit

extension UIColor {
  /// Primary icon color
  static var affineIconPrimary: UIColor {
    UIColor(named: "affine.icon.primary", in: .module, compatibleWith: nil) ?? .black
  }

  /// Primary background layer color
  static var affineLayerBackgroundPrimary: UIColor {
    UIColor(named: "affine.layer.background.primary", in: .module, compatibleWith: nil) ?? .white
  }

  /// Secondary background layer color
  static var affineLayerBackgroundSecondary: UIColor {
    UIColor(named: "affine.layer.background.secondary", in: .module, compatibleWith: nil) ?? .systemGray6
  }

  /// Border layer color
  static var affineLayerBorder: UIColor {
    UIColor(named: "affine.layer.border", in: .module, compatibleWith: nil) ?? .gray
  }

  /// Pure white layer color
  static var affineLayerPureWhite: UIColor {
    UIColor(named: "affine.layer.pureWhite", in: .module, compatibleWith: nil) ?? .white
  }

  /// Primary button color
  static var affineButtonPrimary: UIColor {
    UIColor(named: "affine.button.primary", in: .module, compatibleWith: nil) ?? .blue
  }

  /// Activated icon color
  static var affineIconActivated: UIColor {
    UIColor(named: "affine.icon.activated", in: .module, compatibleWith: nil) ?? .blue
  }

  /// Text emphasis color
  static var affineTextEmphasis: UIColor {
    UIColor(named: "affine.text.emphasis", in: .module, compatibleWith: nil) ?? .blue
  }

  /// Text link color
  static var affineTextLink: UIColor {
    UIColor(named: "affine.text.link", in: .module, compatibleWith: nil) ?? .blue
  }

  /// List dot and number color
  static var affineTextListDotAndNumber: UIColor {
    UIColor(named: "affine.text.listDotAndNumber", in: .module, compatibleWith: nil) ?? .blue
  }

  /// Placeholder text color
  static var affineTextPlaceholder: UIColor {
    UIColor(named: "affine.text.placeholder", in: .module, compatibleWith: nil) ?? .gray
  }

  /// Primary text color
  static var affineTextPrimary: UIColor {
    UIColor(named: "affine.text.primary", in: .module, compatibleWith: nil) ?? .black
  }

  /// Pure white text color
  static var affineTextPureWhite: UIColor {
    UIColor(named: "affine.text.pureWhite", in: .module, compatibleWith: nil) ?? .white
  }

  /// Secondary text color
  static var affineTextSecondary: UIColor {
    UIColor(named: "affine.text.secondary", in: .module, compatibleWith: nil) ?? .gray
  }

  /// Tertiary text color
  static var affineTextTertiary: UIColor {
    UIColor(named: "affine.text.tertiary", in: .module, compatibleWith: nil) ?? .gray
  }
}
