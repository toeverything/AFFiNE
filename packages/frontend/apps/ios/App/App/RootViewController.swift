//
//  RootViewController.swift
//  App
//
//  Created by 秋星桥 on 2024/11/18.
//

import AffineResources
import UIKit
import WebKit

class RootViewController: UINavigationController {
  private var affineViewController: AFFiNEViewController?
  private var didScheduleOnboardingPresentation = false
  private var didRunColdStartPaywallFlow = false
  private var coldStartPaywallRetryCount = 0

  override init(rootViewController _: UIViewController) {
    fatalError() // "you are not allowed to call this"
  }

  override init(navigationBarClass _: AnyClass?, toolbarClass _: AnyClass?) {
    fatalError() // "you are not allowed to call this"
  }

  required init?(coder aDecoder: NSCoder) {
    super.init(coder: aDecoder)
    commitInit()
  }

  override init(nibName _: String?, bundle _: Bundle?) {
    fatalError() // "you are not allowed to call this"
  }

  func commitInit() {
    assert(viewControllers.isEmpty)
    let affineViewController = AFFiNEViewController()
    self.affineViewController = affineViewController
    viewControllers = [affineViewController]
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if !presentOnboardingIfNeeded() {
      runColdStartPaywallFlowIfNeeded()
    }
  }

  @discardableResult
  private func presentOnboardingIfNeeded(force: Bool = false) -> Bool {
    guard force || !didScheduleOnboardingPresentation else { return false }
    guard force || !OnboardingFlag.isCompleted else { return false }
    guard presentedViewController == nil else { return false }

    didScheduleOnboardingPresentation = true
    let onboardingController = OnboardingViewController()
    onboardingController.modalPresentationStyle = .fullScreen
    onboardingController.onCompleteOnboarding = { [weak self, weak onboardingController] in
      self?.handleOnboardingCompletion(from: onboardingController)
    }
    present(onboardingController, animated: false)
    return true
  }

  private func runColdStartPaywallFlowIfNeeded() {
    guard OnboardingFlag.isCompleted else { return }
    guard !didRunColdStartPaywallFlow else { return }
    guard presentedViewController == nil else {
      scheduleColdStartPaywallFlowRetry()
      return
    }
    guard let webView = affineViewController?.webView else {
      scheduleColdStartPaywallFlowRetry()
      return
    }

    didRunColdStartPaywallFlow = true
    Task { @MainActor [weak self, weak webView] in
      guard let self, let webView else { return }

      do {
        try await waitForColdStartHomeDocReady(in: webView)

        let isAlreadySignedIn = await PaywallAuthGuard.currentUserIdentifier(in: webView) != nil
        if !isAlreadySignedIn {
          let action = await presentColdStartSignInSheet()
          guard action == .seeProBenefits else { return }
        }

        let isSignedIn = try await PaywallAuthGuard.ensureSignedIn(using: webView)
        guard isSignedIn else {
          return
        }

        if try await PaywallAuthGuard.hasProSubscription(in: webView) {
          return
        }

        presentSharedPaywall(initialPlan: .pro, bindWebView: webView)
      } catch {
        didRunColdStartPaywallFlow = false
        scheduleColdStartPaywallFlowRetry()
      }
    }
  }

  private func scheduleColdStartPaywallFlowRetry() {
    guard coldStartPaywallRetryCount < 3 else { return }
    coldStartPaywallRetryCount += 1

    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      self?.runColdStartPaywallFlowIfNeeded()
    }
  }

  @MainActor
  private func presentColdStartSignInSheet() async -> ColdStartSignInSheetViewController.Action {
    guard presentedViewController == nil else { return .continueFree }

    return await withCheckedContinuation { continuation in
      let controller = ColdStartSignInSheetViewController()
      controller.onAction = { action in
        continuation.resume(returning: action)
      }
      present(controller, animated: true)
    }
  }

  private func waitForColdStartHomeDocReady(in webView: WKWebView) async throws {
    let deadline = Date().addingTimeInterval(20)

    while Date() < deadline {
      if await isHomeDocReady(in: webView) {
        return
      }
      try await Task.sleep(nanoseconds: 250_000_000)
    }

    throw NSError(
      domain: "RootViewController",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: String(localized: "AFFiNE home is still loading.")]
    )
  }

  private func isHomeDocReady(in webView: WKWebView) async -> Bool {
    do {
      let result = try await webView.callAsyncJavaScript(
        """
        const bridgeReady = typeof window.getCurrentUserIdentifier === 'function'
          && typeof window.showNativeSignIn === 'function';
        const bodyReady = Boolean(document.body && document.body.children.length > 0);
        return document.readyState === 'complete' && bridgeReady && bodyReady;
        """,
        contentWorld: .page
      )
      return (result as? Bool) == true
    } catch {
      return false
    }
  }

  private func handleOnboardingCompletion(from onboardingController: OnboardingViewController?) {
    Task { @MainActor [weak self, weak onboardingController] in
      guard let self else { return }
      OnboardingFlag.markCompleted()
      didRunColdStartPaywallFlow = true

      guard let webView = affineViewController?.webView else {
        showOnboardingAlert(message: String(localized: "AFFiNE is still loading. Please try again in a moment."))
        return
      }

      let isSignedIn: Bool
      do {
        isSignedIn = try await PaywallAuthGuard.ensureSignedIn(
          using: webView,
          dismissing: onboardingController
        )
      } catch {
        showOnboardingAlert(message: error.localizedDescription)
        return
      }
      guard isSignedIn else {
        return
      }

      do {
        if try await PaywallAuthGuard.hasProSubscription(in: webView) {
          finishOnboarding(from: nil)
          return
        }
      } catch {
        showOnboardingAlert(message: error.localizedDescription)
        finishOnboarding(from: nil)
        return
      }

      presentSharedPaywall(
        initialPlan: .pro,
        bindWebView: webView,
        onClose: { [weak self] in
          self?.finishOnboarding(from: nil)
        },
        onPurchaseCompleted: { [weak self] in
          self?.finishOnboarding(from: nil)
        }
      )
    }
  }

  @MainActor
  private func presentSharedPaywall(
    initialPlan: AppPaywallPlan,
    bindWebView webView: WKWebView,
    onClose: (() -> Void)? = nil,
    onPurchaseCompleted: (() -> Void)? = nil
  ) {
    guard presentedViewController == nil else { return }

    let paywallController = AppPaywallViewController()
    paywallController.initialPlan = initialPlan
    paywallController.bindWebView = webView
    paywallController.modalPresentationStyle = .fullScreen
    paywallController.modalTransitionStyle = .coverVertical
    paywallController.onClose = onClose
    paywallController.onPurchaseCompleted = onPurchaseCompleted
    present(paywallController, animated: true)
  }

  private func finishOnboarding(from controller: UIViewController?) {
    OnboardingFlag.markCompleted()
    affineViewController?.webView?.evaluateJavaScript("window.location.assign('/');")

    guard let controller, controller.presentingViewController != nil else {
      didScheduleOnboardingPresentation = true
      return
    }

    controller.dismiss(animated: true) { [weak self] in
      self?.didScheduleOnboardingPresentation = true
    }
  }

  @MainActor
  private func showOnboardingAlert(message: String) {
    let alert = UIAlertController(
      title: String(localized: "Onboarding"),
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "OK"), style: .default))
    (presentedViewController ?? self).present(alert, animated: true)
  }
}
