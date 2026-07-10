//
//  RootViewController.swift
//  App
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit
import WebKit

private final class OnboardingSignInOverlayView: UIView {
  var onClose: (() -> Void)?

  private lazy var closeButton: UIButton = {
    var configuration = UIButton.Configuration.plain()
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)

    let button = UIButton(configuration: configuration)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.tintColor = .label
    button.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.96)
    button.layer.cornerRadius = 12
    button.layer.shadowColor = UIColor.black.withAlphaComponent(0.18).cgColor
    button.layer.shadowOpacity = 1
    button.layer.shadowRadius = 12
    button.layer.shadowOffset = CGSize(width: 0, height: 4)
    button.setImage(UIImage(systemName: "xmark"), for: .normal)
    button.addTarget(self, action: #selector(handleCloseTapped), for: .touchUpInside)
    return button
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    translatesAutoresizingMaskIntoConstraints = false

    addSubview(closeButton)
    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 8),
      closeButton.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
      closeButton.widthAnchor.constraint(equalToConstant: 44),
      closeButton.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    let pointInButton = convert(point, to: closeButton)
    return closeButton.point(inside: pointInButton, with: event)
  }

  @objc
  private func handleCloseTapped() {
    onClose?()
  }
}

@objc
class RootViewController: UINavigationController {
  private var affineViewController: AFFiNEViewController?
  private var didScheduleOnboardingPresentation = false
  private var didRunColdStartPaywallFlow = false
  private var coldStartPaywallRetryCount = 0
  private weak var onboardingSignInOverlay: OnboardingSignInOverlayView?
  private var didCancelOnboardingSignIn = false

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
        defer { hideOnboardingSignInOverlay() }
        didCancelOnboardingSignIn = false
        try await waitForColdStartHomeDocReady(in: webView)

        let isSignedIn = try await PaywallAuthGuard.ensureSignedInWithRoute(
          using: webView,
          onSignInFlowPresented: { [weak self, weak webView] in
            guard let self, let webView else { return }
            self.showOnboardingSignInOverlay(bindWebView: webView)
          },
          isCancelled: { [weak self] in
            self?.didCancelOnboardingSignIn == true
          }
        )
        guard isSignedIn else {
          didCancelOnboardingSignIn = false
          return
        }
        didCancelOnboardingSignIn = false

        if try await PaywallAuthGuard.hasProSubscription(in: webView) {
          return
        }

        presentSharedPaywall(initialPlan: .pro, bindWebView: webView)
      } catch {
        if didCancelOnboardingSignIn {
          didCancelOnboardingSignIn = false
          return
        }
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
      userInfo: [NSLocalizedDescriptionKey: "AFFiNE home is still loading."]
    )
  }

  private func isHomeDocReady(in webView: WKWebView) async -> Bool {
    do {
      let result = try await webView.callAsyncJavaScript(
        """
        const docId = window.getCurrentDocId?.();
        const workspaceId = window.getCurrentWorkspaceId?.();
        return document.readyState === 'complete' && Boolean(docId) && Boolean(workspaceId);
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
      didRunColdStartPaywallFlow = true
      didCancelOnboardingSignIn = false
      OnboardingFlag.markCompleted()

      guard let webView = affineViewController?.webView else {
        showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
        return
      }

      defer { hideOnboardingSignInOverlay() }

      let isSignedIn: Bool
      do {
        isSignedIn = try await PaywallAuthGuard.ensureSignedInWithRoute(
          using: webView,
          dismissing: onboardingController,
          onSignInFlowPresented: { [weak self, weak webView] in
            guard let self, let webView else { return }
            self.showOnboardingSignInOverlay(bindWebView: webView)
          },
          isCancelled: { [weak self] in
            self?.didCancelOnboardingSignIn == true
          }
        )
      } catch {
        if didCancelOnboardingSignIn {
          didCancelOnboardingSignIn = false
          finishOnboarding(from: nil)
          return
        }
        showOnboardingAlert(message: error.localizedDescription)
        return
      }
      guard isSignedIn else {
        didCancelOnboardingSignIn = false
        finishOnboarding(from: nil)
        return
      }
      didCancelOnboardingSignIn = false

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

  @MainActor
  private func showOnboardingSignInOverlay(bindWebView webView: WKWebView) {
    guard onboardingSignInOverlay == nil else { return }

    let overlay = OnboardingSignInOverlayView()
    overlay.onClose = { [weak self, weak webView] in
      guard let self, let webView else { return }
      self.cancelOnboardingSignIn(using: webView)
    }

    view.addSubview(overlay)
    NSLayoutConstraint.activate([
      overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      overlay.topAnchor.constraint(equalTo: view.topAnchor),
      overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    view.bringSubviewToFront(overlay)
    onboardingSignInOverlay = overlay
  }

  @MainActor
  private func hideOnboardingSignInOverlay() {
    onboardingSignInOverlay?.removeFromSuperview()
    onboardingSignInOverlay = nil
  }

  @MainActor
  private func cancelOnboardingSignIn(using webView: WKWebView) {
    guard !didCancelOnboardingSignIn else { return }
    didCancelOnboardingSignIn = true
    hideOnboardingSignInOverlay()
    navigateWebViewToHome(webView)
  }

  @MainActor
  private func navigateWebViewToHome(_ webView: WKWebView) {
    if
      let currentURL = webView.url,
      var components = URLComponents(url: currentURL, resolvingAgainstBaseURL: false)
    {
      components.path = "/"
      components.query = nil
      components.fragment = nil

      if let homeURL = components.url {
        webView.load(URLRequest(url: homeURL))
        return
      }
    }

    webView.evaluateJavaScript("window.location.assign('/');")
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
      title: "Onboarding",
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    (presentedViewController ?? self).present(alert, animated: true)
  }
}
