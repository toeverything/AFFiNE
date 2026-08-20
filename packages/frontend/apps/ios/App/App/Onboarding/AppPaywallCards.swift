import SwiftUI

struct AppPaywallCard: View {
  let plan: AppPaywallPlan
  let priceInfo: NativePaywallPriceInfo?
  let layout: AppPaywallLayout
  let palette: AppPaywallPalette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(LocalizedStringKey(plan.headerName))
        .font(.system(size: layout.cardTitleFontSize, weight: .black))
        .foregroundStyle(palette.primaryText)
        .padding(.bottom, layout.sectionSpacing * 0.8)

      if let priceInfo {
        HStack(alignment: .lastTextBaseline, spacing: 5) {
          Text(priceInfo.value)
            .font(.system(size: layout.priceFontSize, weight: .black))
            .foregroundStyle(palette.primaryText)
          Text(LocalizedStringKey(priceInfo.suffix))
            .font(.system(size: layout.priceSuffixFontSize, weight: .bold))
            .foregroundStyle(palette.primaryText)
        }
      } else {
        Text("Loading price")
          .font(.system(size: layout.priceFontSize * 0.55, weight: .bold))
          .foregroundStyle(palette.secondaryText)
          .frame(height: layout.priceFontSize)
      }

      Text(LocalizedStringKey(plan.description))
        .font(.system(size: layout.descriptionFontSize, weight: .medium))
        .foregroundStyle(palette.secondaryText)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 7)
        .padding(.bottom, layout.sectionSpacing)

      Divider()
        .overlay(AffineColors.layerBorder.color.opacity(0.55))
        .padding(.bottom, layout.sectionSpacing)

      VStack(alignment: .leading, spacing: layout.featureSpacing) {
        ForEach(plan.features, id: \.self) { feature in
          AppPaywallFeatureRow(text: feature, fontSize: layout.featureFontSize, palette: palette)
        }
      }

      Spacer(minLength: 0)
    }
    .padding(.horizontal, layout.cardHorizontalPadding)
    .padding(.top, layout.cardTopPadding)
    .padding(.bottom, layout.cardBottomPadding)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.cardBackground)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .shadow(color: palette.cardPrimaryShadow, radius: 22, x: 0, y: 10)
    .shadow(color: palette.cardSecondaryShadow, radius: 16, x: 0, y: 5)
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(palette.cardBorder, lineWidth: 1.45)
    }
    .overlay(alignment: .topTrailing) {
      if let badge = plan.badge {
        Text(LocalizedStringKey(badge))
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(AffineColors.layerPureWhite.color)
          .padding(.horizontal, 16)
          .padding(.vertical, 7)
          .background(AffineColors.buttonPrimary.color)
          .clipShape(Capsule())
          .shadow(color: AffineColors.buttonPrimary.color.opacity(0.22), radius: 12, x: 0, y: 5)
          .offset(x: -8, y: -15)
      }
    }
  }
}

private struct AppPaywallFeatureRow: View {
  let text: String
  let fontSize: CGFloat
  let palette: AppPaywallPalette

  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: max(13, fontSize - 0.5), weight: .bold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
        .padding(.top, 2)

      Text(LocalizedStringKey(text))
        .font(.system(size: fontSize, weight: .medium))
        .foregroundStyle(palette.primaryText)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct AppPaywallFooterLinks: View {
  let palette: AppPaywallPalette

  var body: some View {
    VStack(spacing: 4) {
      Text("Cancel Anytime")
        .font(.system(size: 16.5, weight: .medium))
        .foregroundStyle(palette.primaryText)

      Text("Subscriptions auto-renew until canceled.")
        .font(.system(size: 12.5, weight: .regular))
        .foregroundStyle(palette.secondaryText)
    }
  }
}

private struct AppPaywallLegalLinks: View {
  let palette: AppPaywallPalette
  let onOpenTerms: () -> Void
  let onOpenPrivacy: () -> Void
  let onOpenSubscriptionTerms: () -> Void
  let onRestore: () -> Void

  var body: some View {
    ViewThatFits {
      HStack(spacing: 0) {
        legalButton(title: "Terms of Use", action: onOpenTerms)
        separator
        legalButton(title: "Privacy Policy", action: onOpenPrivacy)
        separator
        legalButton(title: "Subscription Terms", action: onOpenSubscriptionTerms)
        separator
        legalButton(title: "Restore", action: onRestore)
      }

      VStack(spacing: 6) {
        HStack(spacing: 0) {
          legalButton(title: "Terms of Use", action: onOpenTerms)
          separator
          legalButton(title: "Privacy Policy", action: onOpenPrivacy)
        }

        HStack(spacing: 0) {
          legalButton(title: "Subscription Terms", action: onOpenSubscriptionTerms)
          separator
          legalButton(title: "Restore", action: onRestore)
        }
      }
    }
    .font(.system(size: 12.5, weight: .medium))
    .foregroundStyle(palette.secondaryText)
  }

  private var separator: some View {
    Text(" | ")
      .foregroundStyle(palette.secondaryText)
  }

  private func legalButton(title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(LocalizedStringKey(title))
        .foregroundStyle(palette.secondaryText)
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
