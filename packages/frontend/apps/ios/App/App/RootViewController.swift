//
//  RootViewController.swift
//  App
//
//  Created by 秋星桥 on 2024/11/18.
//

import AffinePaywall
import UIKit
import WebKit

@objc
class RootViewController: UINavigationController {
  private var affineViewController: AFFiNEViewController?
  private var didScheduleOnboardingPresentation = false

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
    #if DEBUG
      OnboardingFlag.reset()
    #endif
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
    presentOnboardingIfNeeded()
  }

  private func presentOnboardingIfNeeded(force: Bool = false) {
    guard force || !didScheduleOnboardingPresentation else { return }
    guard force || !OnboardingFlag.isCompleted else { return }
    guard presentedViewController == nil else { return }

    didScheduleOnboardingPresentation = true
    let onboardingController = OnboardingViewController()
    onboardingController.modalPresentationStyle = .fullScreen
    onboardingController.onShowPaywall = { [weak self, weak onboardingController] in
      self?.showOnboardingPaywall(from: onboardingController)
    }
    present(onboardingController, animated: false)
  }

  private func showOnboardingPaywall(from onboardingController: OnboardingViewController?) {
    let presentPaywall = { [weak self] in
      self?.presentCustomOnboardingPaywall(initialPurchaseType: .pro)
    }

    if let onboardingController, onboardingController.presentingViewController != nil {
      onboardingController.dismiss(animated: true) {
        presentPaywall()
      }
    } else {
      presentPaywall()
    }
  }

  private func presentCustomOnboardingPaywall(initialPurchaseType: OnboardingPurchaseType) {
    guard presentedViewController == nil else { return }

    let paywallController = OnboardingPaywallViewController()
    paywallController.initialPurchaseType = initialPurchaseType
    paywallController.modalPresentationStyle = .fullScreen
    paywallController.modalTransitionStyle = .coverVertical
    paywallController.onClose = { [weak self, weak paywallController] in
      self?.finishOnboarding(from: paywallController)
    }
    paywallController.onPurchase = { [weak self, weak paywallController] type in
      guard let paywallController else { return }
      self?.handleCustomPaywallPurchase(type, from: paywallController)
    }
    paywallController.onRestorePurchases = { [weak self, weak paywallController] in
      self?.restorePurchasesForOnboarding(from: paywallController)
    }
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

  private func handleCustomPaywallPurchase(
    _ type: OnboardingPurchaseType,
    from paywallController: OnboardingPaywallViewController
  ) {
    paywallController.setPurchaseProcessing(true)
    Task { [weak self, weak paywallController] in
      await self?.processCustomPaywallPurchase(type, paywallController: paywallController)
    }
  }

  @MainActor
  private func processCustomPaywallPurchase(
    _ type: OnboardingPurchaseType,
    paywallController: OnboardingPaywallViewController?
  ) async {
    let wasPresentingCustomPaywall = paywallController?.presentingViewController != nil
    let isSignedIn = await ensureUserSignedIn(from: paywallController)
    paywallController?.setPurchaseProcessing(false)

    guard isSignedIn else {
      if wasPresentingCustomPaywall {
        presentCustomOnboardingPaywall(initialPurchaseType: type)
      }
      return
    }

    let presentingController: UIViewController
    if let paywallController, paywallController.presentingViewController != nil {
      presentingController = paywallController
    } else {
      presentingController = self
    }

    presentPaywallForOnboarding(
      type: type,
      from: presentingController,
      customPaywallController: paywallController
    )
  }

  @MainActor
  private func ensureUserSignedIn(from controller: UIViewController?) async -> Bool {
    guard let webView = affineViewController?.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return false
    }

    if await currentUserIdentifier(in: webView) != nil {
      return true
    }

    await dismissPresentedFlow(controller)

    do {
      let result = try await webView.callAsyncJavaScript(
        "return await window.requestSignIn();",
        contentWorld: .page
      )
      if userIdentifier(from: result) != nil {
        return true
      }
    } catch {
      do {
        try await webView.evaluateJavaScript("window.location.assign('/sign-in');")
      } catch {
        return false
      }
    }

    if await waitForCurrentUserIdentifier(in: webView, timeout: 300) {
      return true
    }

    return false
  }

  @MainActor
  private func dismissPresentedFlow(_ controller: UIViewController?) async {
    guard let controller, controller.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      controller.dismiss(animated: true) {
        continuation.resume()
      }
    }
  }

  @MainActor
  private func currentUserIdentifier(in webView: WKWebView) async -> String? {
    do {
      let result = try await webView.callAsyncJavaScript(
        "return window.getCurrentUserIdentifier?.();",
        contentWorld: .page
      )
      return userIdentifier(from: result)
    } catch {
      return nil
    }
  }

  @MainActor
  private func waitForCurrentUserIdentifier(in webView: WKWebView, timeout: TimeInterval) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if await currentUserIdentifier(in: webView) != nil {
        return true
      }
      try? await Task.sleep(nanoseconds: 750_000_000)
    }
    return false
  }

  private func userIdentifier(from result: Any?) -> String? {
    guard let rawIdentifier = result as? String else { return nil }
    let identifier = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
    return identifier.isEmpty ? nil : identifier
  }

  @MainActor
  private func presentPaywallForOnboarding(
    type: OnboardingPurchaseType,
    from controller: UIViewController,
    customPaywallController: OnboardingPaywallViewController?
  ) {
    guard let affineViewController, let webView = affineViewController.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return
    }

    Paywall.presentWall(
      toController: controller,
      bindWebContext: webView,
      type: type.rawValue
    ) { [weak self, weak customPaywallController] completedPurchase in
      self?.handleNativeOnboardingPaywallDismiss(
        completedPurchase: completedPurchase,
        retryType: type,
        customPaywallController: customPaywallController
      )
    }
  }

  @MainActor
  private func restorePurchasesForOnboarding(from controller: UIViewController?) {
    guard let affineViewController, let webView = affineViewController.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return
    }

    Paywall.restorePurchases(
      fromController: controller ?? self,
      bindWebContext: webView
    )
  }

  @MainActor
  private func handleNativeOnboardingPaywallDismiss(
    completedPurchase: Bool,
    retryType: OnboardingPurchaseType,
    customPaywallController: OnboardingPaywallViewController?
  ) {
    if completedPurchase {
      finishOnboarding(from: customPaywallController)
      return
    }

    guard customPaywallController?.presentingViewController == nil else {
      return
    }

    presentCustomOnboardingPaywall(initialPurchaseType: retryType)
  }

  @MainActor
  private func showOnboardingAlert(message: String) {
    let alert = UIAlertController(
      title: "Onboarding",
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    (presentedViewController ?? self).present(alert, animated: true)
  }
}
