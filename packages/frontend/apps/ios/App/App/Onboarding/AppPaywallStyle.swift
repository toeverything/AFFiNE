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

  var gridOpacity: Double {
    isDark ? 0.22 : 1
  }

  var primaryText: Color {
    AffineColors.textPrimary.color
  }

  var secondaryText: Color {
    AffineColors.textSecondary.color
  }

  var cardBackground: Color {
    isDark ? AffineColors.layerBackgroundSecondary.color.opacity(0.96) : AffineColors.layerPureWhite.color
  }

  var cardBorder: Color {
    isDark ? AffineColors.buttonPrimary.color.opacity(0.62) : AffineColors.buttonPrimary.color.opacity(0.98)
  }

  var cardPrimaryShadow: Color {
    isDark ? Color.black.opacity(0.34) : AffineColors.buttonPrimary.color.opacity(0.12)
  }

  var cardSecondaryShadow: Color {
    isDark ? Color.black.opacity(0.26) : Color.black.opacity(0.06)
  }

  var carouselShadow: Color {
    Color.black
  }

  var closeButtonBackground: Color {
    isDark ? Color.white.opacity(0.08) : Color.white.opacity(0.72)
  }

  var closeButtonForeground: Color {
    AffineColors.textSecondary.color
  }

  var inactiveDot: Color {
    AffineColors.buttonPrimary.color.opacity(isDark ? 0.26 : 0.18)
  }
}

struct AppPaywallLayout {
  let size: CGSize
  let safeAreaInsets: EdgeInsets

  private var isLandscape: Bool {
    size.width > size.height
  }

  private var isCompactLandscape: Bool {
    isLandscape && min(size.width, size.height) < 430
  }

  var pageMinHeight: CGFloat {
    max(size.height, 640)
  }

  var headerTopPadding: CGFloat {
    isCompactLandscape ? max(safeAreaInsets.top + 4, 8) : 14
  }

  var horizontalPadding: CGFloat {
    max(isLandscape ? 24 : 28, max(safeAreaInsets.leading, safeAreaInsets.trailing) + 18)
  }

  var headerHorizontalPadding: CGFloat {
    max(18, max(safeAreaInsets.leading, safeAreaInsets.trailing) + 14)
  }

  var titleTopSpacing: CGFloat {
    isCompactLandscape ? 8 : 18
  }

  var titleBottomSpacing: CGFloat {
    isCompactLandscape ? 8 : 10
  }

  var titleFontSize: CGFloat {
    isCompactLandscape ? 23 : 30
  }

  var carouselHeight: CGFloat {
    if isCompactLandscape {
      return min(max(size.height * 0.54, 250), 300)
    }
    return isLandscape ? min(max(size.height * 0.58, 330), 430) : 494
  }

  var cardSpacing: CGFloat {
    isCompactLandscape ? 6 : 8
  }

  func cardWidth(for availableWidth: CGFloat) -> CGFloat {
    if isCompactLandscape {
      return min(max(availableWidth * 0.38, 218), 272)
    }
    if isLandscape {
      return min(max(availableWidth * 0.34, 258), 320)
    }
    return min(max(availableWidth - 116, 244), 288)
  }

  var cardTitleFontSize: CGFloat {
    isCompactLandscape ? 22 : 28
  }

  var priceFontSize: CGFloat {
    isCompactLandscape ? 24 : 30
  }

  var priceSuffixFontSize: CGFloat {
    isCompactLandscape ? 13 : 16
  }

  var descriptionFontSize: CGFloat {
    isCompactLandscape ? 13 : 15.5
  }

  var featureFontSize: CGFloat {
    isCompactLandscape ? 12.5 : 15.5
  }

  var featureSpacing: CGFloat {
    isCompactLandscape ? 9 : 17
  }

  var cardHorizontalPadding: CGFloat {
    isCompactLandscape ? 17 : 23
  }

  var cardTopPadding: CGFloat {
    isCompactLandscape ? 16 : 22
  }

  var cardBottomPadding: CGFloat {
    isCompactLandscape ? 14 : 20
  }

  var sectionSpacing: CGFloat {
    isCompactLandscape ? 10 : 20
  }

  var buttonHeight: CGFloat {
    isCompactLandscape ? 50 : 58
  }

  var buttonFontSize: CGFloat {
    isCompactLandscape ? 16 : 18
  }

  var dotsTopPadding: CGFloat {
    isCompactLandscape ? 8 : 10
  }

  var footerTopPadding: CGFloat {
    isCompactLandscape ? 6 : 8
  }

  var buttonTopPadding: CGFloat {
    isCompactLandscape ? 8 : 10
  }

  var legalTopPadding: CGFloat {
    isCompactLandscape ? 8 : 10
  }

  var legalBottomPadding: CGFloat {
    max(safeAreaInsets.bottom + (isCompactLandscape ? 6 : 8), isCompactLandscape ? 8 : 16)
  }
}
