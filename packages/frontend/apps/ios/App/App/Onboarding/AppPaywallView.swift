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

        palette.backgroundOverlay
          .ignoresSafeArea()

        ScrollView(.vertical, showsIndicators: false) {
          AppPaywallCarouselPage(
            bridge: bridge,
            initialPlan: initialPlan,
            layout: layout,
            palette: palette,
            onPurchase: onPurchase,
            onRestorePurchases: onRestorePurchases,
            onClose: onClose
          )
          .frame(minHeight: layout.pageMinHeight, alignment: .top)
          .frame(width: geometry.size.width, alignment: .top)
        }
        .scrollBounceBehavior(.basedOnSize)

        IntroGridOverlay()
          .opacity(palette.gridOpacity)
          .ignoresSafeArea()
          .allowsHitTesting(false)
          .zIndex(999)
      }
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
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

struct AppPaywallCarouselPage: View {
  @Environment(\.openURL) private var openURL

  @ObservedObject var bridge: NativePaywallBridge
  let initialPlan: AppPaywallPlan
  let layout: AppPaywallLayout
  let palette: AppPaywallPalette
  let onPurchase: (AppPaywallPlan) -> Void
  let onRestorePurchases: () -> Void
  let onClose: () -> Void

  private let plans: [AppPaywallPlan] = [.lite, .pro, .ai]
  private let visibleSlots = [-2, -1, 0, 1, 2]
  private let settleAnimation = Animation.spring(response: 0.32, dampingFraction: 0.9)
  private let settleDuration = 0.24

  @State private var selectedPlan: AppPaywallPlan = .pro
  @State private var currentPlanIndex = 1
  @State private var settlingOffset: CGFloat = 0
  @State private var isSettling = false
  @GestureState private var dragTranslation: CGFloat = 0

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

    let planOrder: [AppPaywallPlan] = [.lite, .pro, .ai]
    let initialIndex = planOrder.firstIndex(of: initialPlan) ?? 1
    _selectedPlan = State(initialValue: planOrder[initialIndex])
    _currentPlanIndex = State(initialValue: initialIndex)
  }

  private var activePlanIndex: Int {
    currentPlanIndex
  }

  var body: some View {
    VStack(spacing: 0) {
      paywallHeader
        .padding(.top, layout.headerTopPadding)
        .padding(.horizontal, layout.headerHorizontalPadding)

      Spacer(minLength: layout.titleTopSpacing)

      Text("Individual Plans")
        .font(.system(size: layout.titleFontSize, weight: .black))
        .foregroundStyle(palette.primaryText)

      Spacer(minLength: layout.titleBottomSpacing)

      GeometryReader { geometry in
        let cardWidth = layout.cardWidth(for: geometry.size.width)
        let cardSpacing = layout.cardSpacing
        let step = cardWidth + cardSpacing
        let totalOffset = settlingOffset + dragTranslation
        let normalizedOffset = totalOffset / step

        ZStack {
          ForEach(visibleSlots, id: \.self) { relativeSlot in
            let position = CGFloat(relativeSlot) + normalizedOffset
            let distance = abs(position)
            let clampedDistance = min(distance, 2)
            let horizontalDirection: CGFloat = position > 0 ? 1 : (position < 0 ? -1 : 0)
            let scale = max(0.94, 1 - clampedDistance * 0.038)
            let opacity = max(0.8, 1 - clampedDistance * 0.11)
            let sideSpread = clampedDistance * 2
            let verticalOffset = clampedDistance * (layout.carouselHeight < 320 ? 9 : 16)
            let rotation = Double(position * 6)
            let shadowOpacity = Double(max(0.09, 0.2 - clampedDistance * 0.05))
            let shadowRadius = max(18, 30 - clampedDistance * 5)
            let shadowYOffset = max(10, 18 - clampedDistance * 2.5)

            AppPaywallCard(
              plan: plan(for: relativeSlot),
              priceInfo: bridge.priceInfo(for: plan(for: relativeSlot).planKind),
              layout: layout,
              palette: palette
            )
            .frame(width: cardWidth, height: geometry.size.height)
            .scaleEffect(scale)
            .rotation3DEffect(
              .degrees(rotation),
              axis: (x: 0, y: 1, z: 0),
              perspective: 0.82
            )
            .opacity(opacity)
            .offset(
              x: position * step + horizontalDirection * sideSpread,
              y: verticalOffset
            )
            .shadow(color: palette.carouselShadow.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowYOffset)
            .zIndex(10 - distance)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .allowsHitTesting(!isSettling && !bridge.isProcessing)
        .highPriorityGesture(carouselDragGesture(step: step))
      }
      .frame(height: layout.carouselHeight)

      HStack(spacing: 9) {
        ForEach(0..<plans.count, id: \.self) { index in
          Circle()
            .fill(index == activePlanIndex ? AffineColors.buttonPrimary.color : palette.inactiveDot)
            .frame(width: 9, height: 9)
        }
      }
      .padding(.top, layout.dotsTopPadding)

      AppPaywallFooterLinks(palette: palette)
        .padding(.top, layout.footerTopPadding)
        .padding(.horizontal, layout.horizontalPadding)

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
      .padding(.horizontal, layout.horizontalPadding)
      .padding(.top, layout.buttonTopPadding)

      AppPaywallLegalLinks(
        palette: palette,
        onOpenTerms: { openLegalURL("https://affine.pro/terms") },
        onOpenPrivacy: { openLegalURL("https://affine.pro/privacy") },
        onOpenSubscriptionTerms: { openLegalURL("https://affine.pro/terms/#subscription") },
        onRestore: onRestorePurchases
      )
      .padding(.top, layout.legalTopPadding)
      .padding(.bottom, layout.legalBottomPadding)
      .padding(.horizontal, layout.horizontalPadding)
    }
    .frame(maxWidth: .infinity, minHeight: layout.pageMinHeight, alignment: .top)
    .onAppear {
      currentPlanIndex = selectedIndex(for: initialPlan)
      selectedPlan = plans[currentPlanIndex]
      bridge.selectPlan(selectedPlan.planKind)
      settlingOffset = 0
    }
    .onChange(of: selectedPlan) { plan in
      bridge.selectPlan(plan.planKind)
    }
  }

  private var paywallHeader: some View {
    HStack {
      Spacer()
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(palette.closeButtonForeground)
          .frame(width: 32, height: 32)
          .background(palette.closeButtonBackground)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
    }
  }

  private func carouselDragGesture(step: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 12)
      .updating($dragTranslation) { value, state, _ in
        state = value.translation.width
      }
      .onEnded { value in
        guard !isSettling else { return }

        settlingOffset = value.translation.width
        let threshold = step * 0.18
        let projectedOffset = value.predictedEndTranslation.width

        if projectedOffset < -threshold {
          settleCarousel(step: step, direction: 1)
        } else if projectedOffset > threshold {
          settleCarousel(step: step, direction: -1)
        } else {
          withAnimation(settleAnimation) {
            settlingOffset = 0
          }
        }
      }
  }

  private func settleCarousel(step: CGFloat, direction: Int) {
    isSettling = true

    withAnimation(settleAnimation) {
      settlingOffset = direction > 0 ? -step : step
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + settleDuration) {
      let nextIndex = wrappedIndex(currentPlanIndex + direction)
      var transaction = Transaction()
      transaction.disablesAnimations = true

      withTransaction(transaction) {
        currentPlanIndex = nextIndex
        selectedPlan = plans[nextIndex]
        settlingOffset = 0
      }

      isSettling = false
    }
  }

  private func selectedIndex(for plan: AppPaywallPlan) -> Int {
    plans.firstIndex(of: plan) ?? 1
  }

  private func wrappedIndex(_ index: Int) -> Int {
    let count = plans.count
    let remainder = index % count
    return remainder >= 0 ? remainder : remainder + count
  }

  private func plan(for relativeSlot: Int) -> AppPaywallPlan {
    plans[wrappedIndex(currentPlanIndex + relativeSlot)]
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
