import AffinePaywall
import AffineResources
import SwiftUI

struct AppPaywallCard: View {
  let plan: AppPaywallPlan
  let priceInfo: NativePaywallPriceInfo?
  let layout: AppPaywallLayout
  let palette: AppPaywallPalette

  var body: some View {
    VStack(alignment: .leading, spacing: layout.cardSectionSpacing) {
      Text(LocalizedStringKey(plan.headerName))
        .font(.system(size: layout.cardTitleFontSize, weight: .bold))

      if let priceInfo {
        HStack(alignment: .lastTextBaseline, spacing: 5) {
          Text(priceInfo.value)
            .font(.system(size: layout.priceFontSize, weight: .bold))
          Text(LocalizedStringKey(priceInfo.suffix))
            .font(.system(size: layout.priceSuffixFontSize, weight: .medium))
        }
      } else {
        Text("Loading price…")
          .font(.system(size: layout.priceSuffixFontSize, weight: .medium))
          .foregroundStyle(palette.secondaryText)
          .frame(height: layout.priceFontSize, alignment: .leading)
      }

      Text(LocalizedStringKey(plan.description))
        .font(.system(size: layout.descriptionFontSize))
        .foregroundStyle(palette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)

      Divider()
        .overlay(AffineColors.layerBorder.color)

      VStack(alignment: .leading, spacing: layout.featureSpacing) {
        ForEach(plan.features, id: \.self) { feature in
          AppPaywallFeatureRow(
            text: feature,
            fontSize: layout.featureFontSize,
            palette: palette
          )
        }
      }
    }
    .padding(layout.cardPadding)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.cardBackground)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(palette.cardBorder, lineWidth: 1)
    }
  }
}

private struct AppPaywallFeatureRow: View {
  let text: String
  let fontSize: CGFloat
  let palette: AppPaywallPalette

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: fontSize, weight: .semibold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
        .padding(.top, 1)

      Text(LocalizedStringKey(text))
        .font(.system(size: fontSize))
        .foregroundStyle(palette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct AppPaywallLegalLinks: View {
  let palette: AppPaywallPalette
  let onOpenTerms: () -> Void
  let onOpenPrivacy: () -> Void
  let onOpenSubscriptionTerms: () -> Void
  let onRestore: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        legalButton(title: "Terms of Use", action: onOpenTerms)
        legalButton(title: "Privacy Policy", action: onOpenPrivacy)
      }
      HStack(spacing: 8) {
        legalButton(title: "Subscription Terms", action: onOpenSubscriptionTerms)
        legalButton(title: "Restore Purchases", action: onRestore)
      }
    }
    .font(.footnote)
  }

  private func legalButton(title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(LocalizedStringKey(title))
        .foregroundStyle(palette.secondaryText)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.plain)
  }
}

#Preview {
  AppPaywallRootView(
    bridge: NativePaywallBridge(initialPlan: .pro),
    initialPlan: .pro,
    onPurchase: { _ in },
    onRestorePurchases: {},
    onClose: {}
  )
}
