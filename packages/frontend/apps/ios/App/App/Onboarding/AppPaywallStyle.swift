import AffineResources
import SwiftUI

struct AppPaywallPalette {
  let colorScheme: ColorScheme

  private var isDark: Bool {
    colorScheme == .dark
  }

  var backgroundOverlay: Color {
    isDark ? Color.black.opacity(0.18) : Color.clear
  }

  var primaryText: Color {
    AffineColors.textPrimary.color
  }

  var secondaryText: Color {
    AffineColors.textSecondary.color
  }

  var cardBackground: Color {
    AffineColors.layerBackgroundPrimary.color.opacity(isDark ? 0.92 : 1)
  }

  var cardBorder: Color {
    AffineColors.layerBorder.color
  }
}

struct AppPaywallLayout {
  let size: CGSize
  let safeAreaInsets: EdgeInsets

  private var isLandscape: Bool {
    size.width > size.height
  }

  var pageMinHeight: CGFloat {
    max(size.height, 620)
  }

  var horizontalPadding: CGFloat {
    max(isLandscape ? 32 : 20, max(safeAreaInsets.leading, safeAreaInsets.trailing) + 16)
  }

  var topPadding: CGFloat {
    max(safeAreaInsets.top + 20, 28)
  }

  var bottomPadding: CGFloat {
    max(safeAreaInsets.bottom + 8, 16)
  }

  var titleFontSize: CGFloat {
    isLandscape ? 26 : 30
  }

  var sectionSpacing: CGFloat {
    isLandscape ? 14 : 18
  }

  var cardTitleFontSize: CGFloat {
    isLandscape ? 22 : 24
  }

  var priceFontSize: CGFloat {
    isLandscape ? 26 : 30
  }

  var priceSuffixFontSize: CGFloat {
    isLandscape ? 13 : 15
  }

  var descriptionFontSize: CGFloat {
    isLandscape ? 14 : 15
  }

  var featureFontSize: CGFloat {
    isLandscape ? 13 : 15
  }

  var featureSpacing: CGFloat {
    isLandscape ? 8 : 12
  }

  var cardSectionSpacing: CGFloat {
    isLandscape ? 10 : 14
  }

  var cardPadding: CGFloat {
    isLandscape ? 18 : 20
  }

  var buttonHeight: CGFloat {
    54
  }

  var buttonFontSize: CGFloat {
    17
  }
}
