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
  private var prepareTask: Task<Void, Never>?
  private var actionTask: Task<Void, Never>?

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

    prepareTask = Task { @MainActor [weak self] in
      await self?.prepareBridge()
    }
  }

  deinit {
    prepareTask?.cancel()
    actionTask?.cancel()
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
    actionTask?.cancel()
    actionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      bridge.selectPlan(plan.planKind)

      do {
        let completed = try await bridge.purchaseSelectedPlan()
        guard completed else { return }

        guard try await hasActiveSubscription(for: plan) else {
          bridge.errorMessage = String(localized: "Your purchase is still being processed. Please try again in a moment.")
          return
        }

        dismiss(animated: true) { [weak self] in
          self?.onPurchaseCompleted?()
        }
      } catch is CancellationError {
        return
      } catch {
        bridge.errorMessage = error.localizedDescription
      }
    }
  }

  private func restorePurchases() {
    actionTask?.cancel()
    actionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        try await bridge.restorePurchases()

        guard try await hasActiveSubscription(for: initialPlan) else {
          bridge.errorMessage = String(localized: "No active purchases were found to restore.")
          return
        }

        dismiss(animated: true) { [weak self] in
          self?.onPurchaseCompleted?()
        }
      } catch is CancellationError {
        return
      } catch {
        bridge.errorMessage = error.localizedDescription
      }
    }
  }

  private func hasActiveSubscription(for plan: AppPaywallPlan) async throws -> Bool {
    guard let webView = bindWebView else {
      throw NSError(
        domain: "AppPaywallViewController",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: String(localized: "Missing required information")]
      )
    }

    switch plan {
    case .ai:
      return try await PaywallAuthGuard.hasAISubscription(in: webView)
    case .pro, .lite:
      return try await PaywallAuthGuard.hasProSubscription(in: webView)
    }
  }

  private func closePaywall() {
    actionTask?.cancel()
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

  var description: String {
    switch self {
    case .pro: "Keep your knowledge available everywhere."
    case .lite: "For people who want their workspace available everywhere."
    case .ai: "For people who want to create, organize faster with AI."
    }
  }

  var buttonTitle: String {
    switch self {
    case .pro: "Continue with Pro"
    case .lite: "Continue with Lite"
    case .ai: "Continue with AI"
    }
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
