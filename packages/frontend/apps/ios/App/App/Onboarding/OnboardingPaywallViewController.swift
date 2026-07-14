import AffinePaywall
import AffineResources
import SwiftUI
import UIKit
import WebKit

final class AppPaywallViewController: UIViewController {
  var initialPlan: AppPaywallPlan = .pro
  weak var bindWebView: WKWebView?
  var onClose: (() -> Void)?
  var onPurchaseCompleted: (() -> Void)?

  private lazy var bridge = NativePaywallBridge(initialPlan: initialPlan.planKind)
  private var hostingController: UIHostingController<AppPaywallRootView>?

  private static var cachedUserInterfaceStyle: UIUserInterfaceStyle {
    switch UserDefaults.standard.string(forKey: AffineThemeStorage.modeKey) {
    case "dark":
      return .dark
    case "light":
      return .light
    default:
      return .unspecified
    }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    overrideUserInterfaceStyle = Self.cachedUserInterfaceStyle
    updateBackgroundColor()

    bridge.bind(webView: bindWebView)

    let rootView = AppPaywallRootView(
      bridge: bridge,
      initialPlan: initialPlan,
      onPurchase: { [weak self] plan in
        self?.purchase(plan: plan)
      },
      onRestorePurchases: { [weak self] in
        self?.restorePurchases()
      },
      onClose: { [weak self] in
        self?.closePaywall()
      }
    )

    let hostingController = UIHostingController(rootView: rootView)
    hostingController.view.backgroundColor = .clear
    self.hostingController = hostingController

    addChild(hostingController)
    view.addSubview(hostingController.view)
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hostingController.didMove(toParent: self)

    Task { @MainActor [weak self] in
      await self?.prepareBridge()
    }
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else { return }
    updateBackgroundColor()
  }

  private func updateBackgroundColor() {
    view.backgroundColor = UIColor(named: "OnboardingBackground") ?? .systemBackground
  }

  @MainActor
  private func prepareBridge() async {
    do {
      try await bridge.prepare()
    } catch {
      bridge.errorMessage = error.localizedDescription
    }
  }

  private func purchase(plan: AppPaywallPlan) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      bridge.selectPlan(plan.planKind)

      do {
        let completed = try await bridge.purchaseSelectedPlan()
        guard completed else { return }

        dismiss(animated: true) { [weak self] in
          self?.onPurchaseCompleted?()
        }
      } catch {
        bridge.errorMessage = error.localizedDescription
      }
    }
  }

  private func restorePurchases() {
    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        try await bridge.restorePurchases()

        guard try await hasActiveSubscriptionForCurrentPlan() else {
          bridge.errorMessage = "No active purchases were found to restore."
          return
        }

        dismiss(animated: true) { [weak self] in
          self?.onPurchaseCompleted?()
        }
      } catch {
        bridge.errorMessage = error.localizedDescription
      }
    }
  }

  private func hasActiveSubscriptionForCurrentPlan() async throws -> Bool {
    guard let webView = bindWebView else {
      throw NSError(
        domain: "AppPaywallViewController",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Missing required information"]
      )
    }

    switch initialPlan {
    case .ai:
      return try await PaywallAuthGuard.hasAISubscription(in: webView)
    case .pro, .lite:
      return try await PaywallAuthGuard.hasProSubscription(in: webView)
    }
  }

  private func closePaywall() {
    dismiss(animated: true) { [weak self] in
      self?.onClose?()
    }
  }
}

enum AppPaywallPlan: String, CaseIterable {
  case pro
  case lite
  case ai

  var planKind: NativePaywallPlanKind {
    switch self {
    case .pro:
      .pro
    case .lite:
      .lite
    case .ai:
      .ai
    }
  }

  var headerName: String {
    switch self {
    case .pro: "Pro"
    case .lite: "LITE"
    case .ai: "AFFINE AI"
    }
  }

  var badge: String? {
    switch self {
    case .pro: "BEST FOR YOU"
    case .lite, .ai: nil
    }
  }

  var fallbackPriceValue: String {
    switch self {
    case .pro: "$81"
    case .lite: "$6.75"
    case .ai: "$8.9"
    }
  }

  var fallbackPriceSuffix: String {
    switch self {
    case .pro: "/year"
    case .lite: "/month"
    case .ai: "/mo, billed annually"
    }
  }

  var description: String {
    switch self {
    case .pro: "Keep your knowledge available everywhere."
    case .lite: "For people who want their workspace available everywhere."
    case .ai: "For people who want to create, organize faster with AI."
    }
  }

  var buttonTitle: String {
    "Continue"
  }

  var features: [String] {
    switch self {
    case .pro:
      [
        "Upload files larger than 10 MB",
        "Sync docs and boards across all devices",
        "Access your workspace on Mac, Windows, Linux, Web, iPhone, and Android",
        "Secure cloud backup for your content",
        "Everything stays up to date, wherever you work",
      ]
    case .lite:
      [
        "Sync docs and boards across all devices",
        "Access AFFiNE on Mac, Windows, Linux, Web, iPhone, and Android",
        "Upload files larger than 10 MB",
        "Secure cloud backup for your content",
        "Pick up where you left off, anytime",
      ]
    case .ai:
      [
        "Generate articles, notes, and content in seconds",
        "Rewrite, improve, and translate your writing",
        "Turn ideas into visuals, mind maps, and presentations",
        "Chat with your documents and knowledge",
        "AI-powered organization and insights",
      ]
    }
  }
}

private struct AppPaywallPalette {
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

private struct AppPaywallLayout {
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

private struct AppPaywallRootView: View {
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

private struct AppPaywallCarouselPage: View {
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

      AppPaywallFooterLinks(palette: palette, onClose: onClose)
        .padding(.top, layout.footerTopPadding)
        .padding(.horizontal, layout.horizontalPadding)

      PrimaryButton(
        title: selectedPlan.buttonTitle,
        isLoading: bridge.isLoading || bridge.isProcessing,
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

private struct AppPaywallCard: View {
  let plan: AppPaywallPlan
  let priceInfo: NativePaywallPriceInfo
  let layout: AppPaywallLayout
  let palette: AppPaywallPalette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(LocalizedStringKey(plan.headerName))
        .font(.system(size: layout.cardTitleFontSize, weight: .black))
        .foregroundStyle(palette.primaryText)
        .padding(.bottom, layout.sectionSpacing * 0.8)

      HStack(alignment: .lastTextBaseline, spacing: 5) {
        Text(priceInfo.value)
          .font(.system(size: layout.priceFontSize, weight: .black))
          .foregroundStyle(palette.primaryText)
        Text(priceInfo.suffix)
          .font(.system(size: layout.priceSuffixFontSize, weight: .bold))
          .foregroundStyle(palette.primaryText)
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
  let onClose: () -> Void

  var body: some View {
    Button(action: onClose) {
      Text("Cancel Anytime")
        .font(.system(size: 16.5, weight: .medium))
        .foregroundStyle(palette.primaryText)
    }
    .buttonStyle(.plain)
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
      Text(title)
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
