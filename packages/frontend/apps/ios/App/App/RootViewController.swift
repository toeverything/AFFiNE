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
    onboardingController.onFinish = { [weak self, weak onboardingController] in
      self?.finishOnboarding(from: onboardingController)
    }
    onboardingController.onPurchase = { [weak self, weak onboardingController] type in
      guard let onboardingController else { return }
      self?.handleOnboardingPurchase(type, from: onboardingController)
    }
    onboardingController.onRestorePurchases = { [weak self] in
      self?.restorePurchasesForOnboarding()
    }
    present(onboardingController, animated: false)
  }

  private func finishOnboarding(from onboardingController: OnboardingViewController?) {
    OnboardingFlag.markCompleted()
    affineViewController?.webView?.evaluateJavaScript("window.location.assign('/');")
    onboardingController?.dismiss(animated: true) { [weak self] in
      self?.didScheduleOnboardingPresentation = true
    }
  }

  private func handleOnboardingPurchase(
    _ type: OnboardingPurchaseType,
    from onboardingController: OnboardingViewController
  ) {
    onboardingController.setPurchaseProcessing(true)
    Task { [weak self, weak onboardingController] in
      await self?.processOnboardingPurchase(type, onboardingController: onboardingController)
    }
  }

  @MainActor
  private func processOnboardingPurchase(
    _ type: OnboardingPurchaseType,
    onboardingController: OnboardingViewController?
  ) async {
    let isSignedIn = await ensureUserSignedIn(from: onboardingController)
    onboardingController?.setPurchaseProcessing(false)

    guard isSignedIn else {
      didScheduleOnboardingPresentation = false
      presentOnboardingIfNeeded(force: true)
      return
    }

    let presentPaywall = { [weak self] in
      self?.presentPaywallForOnboarding(type: type)
    }

    if let onboardingController, onboardingController.presentingViewController != nil {
      onboardingController.dismiss(animated: true) {
        presentPaywall()
      }
    } else {
      presentPaywall()
    }
  }

  @MainActor
  private func ensureUserSignedIn(from onboardingController: OnboardingViewController?) async -> Bool {
    guard let webView = affineViewController?.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return false
    }

    if await currentUserIdentifier(in: webView) != nil {
      return true
    }

    await dismissOnboarding(onboardingController)

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
  private func dismissOnboarding(_ onboardingController: OnboardingViewController?) async {
    guard let onboardingController, onboardingController.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      onboardingController.dismiss(animated: true) {
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
  private func presentPaywallForOnboarding(type: OnboardingPurchaseType) {
    guard let affineViewController, let webView = affineViewController.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return
    }
    Paywall.presentWall(
      toController: self,
      bindWebContext: webView,
      type: type.rawValue
    ) { [weak self] completedPurchase in
      self?.handleOnboardingPaywallDismiss(completedPurchase: completedPurchase)
    }
  }

  @MainActor
  private func restorePurchasesForOnboarding() {
    guard let affineViewController, let webView = affineViewController.webView else {
      showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
      return
    }

    Paywall.restorePurchases(
      fromController: self,
      bindWebContext: webView
    )
  }

  @MainActor
  private func handleOnboardingPaywallDismiss(completedPurchase: Bool) {
    if completedPurchase {
      OnboardingFlag.markCompleted()
      affineViewController?.webView?.evaluateJavaScript("window.location.assign('/');")
      didScheduleOnboardingPresentation = true
      return
    }

    didScheduleOnboardingPresentation = false
    presentOnboardingIfNeeded(force: true)
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
