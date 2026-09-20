import AffinePaywall
import AffineResources
import SwiftUI

struct AppPaywallRootView: View {
  @Environment(\.colorScheme) private var colorScheme

  @ObservedObject var bridge: NativePaywallBridge
  let initialPlan: AppPaywallPlan
  let onPurchase: (AppPaywallPlan) -> Void
  let onRestorePurchases: () -> Void
  let onClose: () -> Void

  private var palette: AppPaywallPalette {
    AppPaywallPalette(colorScheme: colorScheme)
  }

  var body: some View {
    GeometryReader { geometry in
      let layout = AppPaywallLayout(
        size: geometry.size,
        safeAreaInsets: geometry.safeAreaInsets
      )

      ZStack {
        OnboardingBackground(isIntroPage: false)
        palette.backgroundOverlay.ignoresSafeArea()

        ScrollView(.vertical, showsIndicators: false) {
          AppPaywallPage(
            bridge: bridge,
            initialPlan: initialPlan,
            layout: layout,
            palette: palette,
            onPurchase: onPurchase,
            onRestorePurchases: onRestorePurchases,
            onClose: onClose
          )
          .frame(minHeight: layout.pageMinHeight, alignment: .top)
        }
        .scrollBounceBehavior(.basedOnSize)
      }
      .frame(width: geometry.size.width, height: geometry.size.height)
      .foregroundStyle(palette.primaryText)
    }
    .alert(
      "Paywall",
      isPresented: Binding(
        get: { bridge.errorMessage != nil },
        set: { isPresented in
          if !isPresented {
            bridge.errorMessage = nil
          }
        }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(bridge.errorMessage ?? "")
    }
  }
}

private struct AppPaywallPage: View {
  @Environment(\.openURL) private var openURL

  @ObservedObject var bridge: NativePaywallBridge
  let initialPlan: AppPaywallPlan
  let layout: AppPaywallLayout
  let palette: AppPaywallPalette
  let onPurchase: (AppPaywallPlan) -> Void
  let onRestorePurchases: () -> Void
  let onClose: () -> Void

  private let plans = AppPaywallPlan.allCases
  @State private var selectedPlan: AppPaywallPlan

  init(
    bridge: NativePaywallBridge,
    initialPlan: AppPaywallPlan,
    layout: AppPaywallLayout,
    palette: AppPaywallPalette,
    onPurchase: @escaping (AppPaywallPlan) -> Void,
    onRestorePurchases: @escaping () -> Void,
    onClose: @escaping () -> Void
  ) {
    self.bridge = bridge
    self.initialPlan = initialPlan
    self.layout = layout
    self.palette = palette
    self.onPurchase = onPurchase
    self.onRestorePurchases = onRestorePurchases
    self.onClose = onClose
    _selectedPlan = State(initialValue: initialPlan)
  }

  var body: some View {
    VStack(spacing: layout.sectionSpacing) {
      Text("Choose your plan")
        .font(.system(size: layout.titleFontSize, weight: .bold))
        .frame(maxWidth: .infinity, alignment: .leading)

      Picker("Plan", selection: $selectedPlan) {
        ForEach(plans, id: \.self) { plan in
          Text(LocalizedStringKey(plan.headerName)).tag(plan)
        }
      }
      .pickerStyle(.segmented)

      AppPaywallCard(
        plan: selectedPlan,
        priceInfo: bridge.priceInfo(for: selectedPlan.planKind),
        layout: layout,
        palette: palette
      )

      Text("Subscriptions renew automatically until canceled.")
        .font(.footnote)
        .foregroundStyle(palette.secondaryText)
        .multilineTextAlignment(.center)

      PrimaryButton(
        title: selectedPlan.buttonTitle,
        isLoading: bridge.isLoading || bridge.isProcessing,
        isEnabled: bridge.isReady,
        fontSize: layout.buttonFontSize,
        height: layout.buttonHeight
      ) {
        triggerPaywallHaptic()
        onPurchase(selectedPlan)
      }

      Button("Not now", action: onClose)
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(palette.secondaryText)
        .frame(maxWidth: .infinity, minHeight: 44)
        .buttonStyle(.plain)

      AppPaywallLegalLinks(
        palette: palette,
        onOpenTerms: { openLegalURL("https://affine.pro/terms") },
        onOpenPrivacy: { openLegalURL("https://affine.pro/privacy") },
        onOpenSubscriptionTerms: { openLegalURL("https://affine.pro/terms/#subscription") },
        onRestore: onRestorePurchases
      )
    }
    .padding(.horizontal, layout.horizontalPadding)
    .padding(.top, layout.topPadding)
    .padding(.bottom, layout.bottomPadding)
    .frame(maxWidth: .infinity, minHeight: layout.pageMinHeight, alignment: .top)
    .onAppear {
      bridge.selectPlan(initialPlan.planKind)
    }
    .onChange(of: selectedPlan) { plan in
      bridge.selectPlan(plan.planKind)
    }
  }

  private func openLegalURL(_ string: String) {
    guard let url = URL(string: string) else { return }
    openURL(url)
  }

  private func triggerPaywallHaptic() {
    let generator = UIImpactFeedbackGenerator(style: .light)
    generator.prepare()
    generator.impactOccurred()
  }
}
