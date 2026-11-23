// The Swift Programming Language
// https://docs.swift.org/swift-book

import SwiftUI
import UIKit

public enum AffineColors: String, CaseIterable {
  case buttonPrimary = "affine.button.primary"
  case iconActivated = "affine.icon.activated"
  case iconPrimary = "affine.icon.primary"
  case layerBackgroundPrimary = "affine.layer.background.primary"
  case layerBackgroundSecondary = "affine.layer.background.secondary"
  case layerBorder = "affine.layer.border"
  case layerPureWhite = "affine.layer.pureWhite"
  case textEmphasis = "affine.text.emphasis"
  case textLink = "affine.text.link"
  case textListDotAndNumber = "affine.text.listDotAndNumber"
  case textPlaceholder = "affine.text.placeholder"
  case textPrimary = "affine.text.primary"
  case textPureWhite = "affine.text.pureWhite"
  case textSecondary = "affine.text.secondary"
  case textTertiary = "affine.text.tertiary"

  @available(iOS 13.0, *)
  public var color: Color {
    Color(rawValue, bundle: .module)
  }

  public var uiColor: UIColor {
    UIColor(named: rawValue, in: .module, compatibleWith: nil) ?? .clear
  }
}

public enum AffineIcons: String, CaseIterable {
  case arrowDown = "ArrowDown"
  case arrowUpBig = "ArrowUpBig"
  case box = "Box"
  case broom = "Broom"
  case bubble = "Bubble"
  case calendar = "Calendar"
  case camera = "Camera"
  case checkCircle = "CheckCircle"
  case close = "Close"
  case image = "Image"
  case more = "More"
  case page = "Page"
  case plus = "Plus"
  case settings = "Settings"
  case think = "Think"
  case tools = "Tools"
  case upload = "Upload"
  case web = "Web"

  @available(iOS 13.0, *)
  public var image: Image {
    Image(rawValue, bundle: .module)
  }

  @available(iOS 13.0, *)
  public var uiImage: UIImage {
    UIImage(named: rawValue, in: .module, with: .none) ?? UIImage()
  }
}
