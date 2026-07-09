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

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(named: "OnboardingBackground") ?? .systemBackground

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
      } catch {
        bridge.errorMessage = error.localizedDescription
      }
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

private struct AppPaywallRootView: View {
  @ObservedObject var bridge: NativePaywallBridge
  let initialPlan: AppPaywallPlan
  let onPurchase: (AppPaywallPlan) -> Void
  let onRestorePurchases: () -> Void
  let onClose: () -> Void

  var body: some View {
    ZStack {
      Color.clear
        .ignoresSafeArea()

      OnboardingBackground(isIntroPage: false)

      VStack(spacing: 0) {
        AppPaywallCarouselPage(
          bridge: bridge,
          initialPlan: initialPlan,
          onPurchase: onPurchase,
          onRestorePurchases: onRestorePurchases,
          onClose: onClose
        )
      }

      IntroGridOverlay()
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .zIndex(999)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .foregroundStyle(AffineColors.textPrimary.color)
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
    onPurchase: @escaping (AppPaywallPlan) -> Void,
    onRestorePurchases: @escaping () -> Void,
    onClose: @escaping () -> Void
  ) {
    self.bridge = bridge
    self.initialPlan = initialPlan
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
        .padding(.top, 14)
        .padding(.horizontal, 18)

      Spacer(minLength: 18)

      Text("Individual Plans")
        .font(.system(size: 30, weight: .black))
        .foregroundStyle(AffineColors.textPrimary.color)

      Spacer(minLength: 10)

      GeometryReader { geometry in
        let cardWidth = min(max(geometry.size.width - 116, 244), 288)
        let cardSpacing: CGFloat = 8
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
            let verticalOffset = clampedDistance * 16
            let rotation = Double(position * 6)
            let shadowOpacity = Double(max(0.09, 0.2 - clampedDistance * 0.05))
            let shadowRadius = max(20, 30 - clampedDistance * 5)
            let shadowYOffset = max(12, 18 - clampedDistance * 2.5)

            AppPaywallCard(
              plan: plan(for: relativeSlot),
              priceInfo: bridge.priceInfo(for: plan(for: relativeSlot).planKind)
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
            .shadow(color: .black.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowYOffset)
            .zIndex(10 - distance)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .allowsHitTesting(!isSettling && !bridge.isProcessing)
        .highPriorityGesture(carouselDragGesture(step: step))
      }
      .frame(height: 494)

      HStack(spacing: 9) {
        ForEach(0..<plans.count, id: \.self) { index in
          Circle()
            .fill(index == activePlanIndex ? AffineColors.buttonPrimary.color : AffineColors.buttonPrimary.color.opacity(0.18))
            .frame(width: 9, height: 9)
        }
      }
      .padding(.top, 10)

      AppPaywallFooterLinks(onClose: onClose)
        .padding(.top, 8)
        .padding(.horizontal, 28)

      PrimaryButton(
        title: selectedPlan.buttonTitle,
        isLoading: bridge.isLoading || bridge.isProcessing,
        fontSize: 18,
        height: 58
      ) {
        triggerPaywallHaptic()
        onPurchase(selectedPlan)
      }
      .padding(.horizontal, 28)
      .padding(.top, 10)

      AppPaywallLegalLinks(
        onOpenTerms: { openLegalURL("https://affine.pro/terms") },
        onOpenPrivacy: { openLegalURL("https://affine.pro/privacy") },
        onOpenSubscriptionTerms: { openLegalURL("https://affine.pro/terms/#subscription") },
        onRestore: onRestorePurchases
      )
      .padding(.top, 10)
      .padding(.bottom, 8)
      .padding(.horizontal, 28)
    }
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
          .foregroundStyle(AffineColors.textSecondary.color)
          .frame(width: 32, height: 32)
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

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(LocalizedStringKey(plan.headerName))
        .font(.system(size: 28, weight: .black))
        .foregroundStyle(AffineColors.textPrimary.color)
        .padding(.bottom, 16)

      HStack(alignment: .lastTextBaseline, spacing: 5) {
        Text(priceInfo.value)
          .font(.system(size: 30, weight: .black))
          .foregroundStyle(AffineColors.textPrimary.color)
        Text(priceInfo.suffix)
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(AffineColors.textPrimary.color)
      }

      Text(LocalizedStringKey(plan.description))
        .font(.system(size: 15.5, weight: .medium))
        .foregroundStyle(AffineColors.textSecondary.color)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 7)
        .padding(.bottom, 20)

      Divider()
        .overlay(AffineColors.layerBorder.color.opacity(0.55))
        .padding(.bottom, 20)

      VStack(alignment: .leading, spacing: 17) {
        ForEach(plan.features, id: \.self) { feature in
          AppPaywallFeatureRow(text: feature)
        }
      }

      Spacer(minLength: 0)
    }
    .padding(.horizontal, 23)
    .padding(.top, 22)
    .padding(.bottom, 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(AffineColors.layerPureWhite.color)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .shadow(color: AffineColors.buttonPrimary.color.opacity(0.12), radius: 22, x: 0, y: 10)
    .shadow(color: .black.opacity(0.06), radius: 16, x: 0, y: 5)
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(AffineColors.buttonPrimary.color.opacity(0.98), lineWidth: 1.45)
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

  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
        .padding(.top, 2)

      Text(LocalizedStringKey(text))
        .font(.system(size: 15.5, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct AppPaywallFooterLinks: View {
  let onClose: () -> Void

  var body: some View {
    Button(action: onClose) {
      Text("Cancel Anytime")
        .font(.system(size: 16.5, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
    }
    .buttonStyle(.plain)
  }
}

private struct AppPaywallLegalLinks: View {
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
    .foregroundStyle(AffineColors.textSecondary.color)
  }

  private var separator: some View {
    Text(" | ")
      .foregroundStyle(AffineColors.textSecondary.color)
  }

  private func legalButton(title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .foregroundStyle(AffineColors.textSecondary.color)
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
