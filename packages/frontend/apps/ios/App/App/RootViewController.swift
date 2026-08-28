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
    presentOnboardingIfNeeded()
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

  private func handleOnboardingCompletion(from onboardingController: OnboardingViewController?) {
    Task { @MainActor [weak self, weak onboardingController] in
      guard let self else { return }

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
      OnboardingFlag.markCompleted()
      guard isSignedIn else {
        return
      }
      await dismissOnboardingIfNeeded(onboardingController)

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

  private func dismissOnboardingIfNeeded(_ controller: UIViewController?) async {
    guard let controller, controller.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      controller.dismiss(animated: false) {
        continuation.resume()
      }
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
