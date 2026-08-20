//
//  RootViewController.swift
//  App
//
//  Created by 秋星桥 on 2024/11/18.
//

import AffineResources
import UIKit
import WebKit

private final class ColdStartSignInSheetViewController: UIViewController {
  private static let portraitSheetHeight: CGFloat = 336
  private static let landscapeSheetHeight: CGFloat = 284
  private static let boltColor = UIColor(red: 1, green: 195 / 255, blue: 0, alpha: 1)

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

  enum Action {
    case seeProBenefits
    case continueFree
  }

  var onAction: ((Action) -> Void)?

  private var didResolve = false

  private let dimmingView: UIView = {
    let view = UIView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.backgroundColor = UIColor.black.withAlphaComponent(0.28)
    view.alpha = 0
    return view
  }()

  private let sheetView: UIView = {
    let view = UIView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.backgroundColor = .systemBackground
    view.layer.cornerRadius = 24
    view.layer.cornerCurve = .continuous
    view.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    view.clipsToBounds = true
    return view
  }()

  private var sheetBottomConstraint: NSLayoutConstraint?
  private var sheetHeightConstraint: NSLayoutConstraint?
  private var stackTopConstraint: NSLayoutConstraint?
  private var stackCenterYConstraint: NSLayoutConstraint?
  private var logoWidthConstraint: NSLayoutConstraint?
  private var logoHeightConstraint: NSLayoutConstraint?
  private var buttonHeightConstraint: NSLayoutConstraint?
  private var continueFreeHeightConstraint: NSLayoutConstraint?
  private var didShowSheet = false

  private var isLandscapeLayout: Bool {
    view.bounds.width > view.bounds.height
  }

  private var currentSheetHeight: CGFloat {
    isLandscapeLayout ? Self.landscapeSheetHeight : Self.portraitSheetHeight
  }

  private let logoImageView: UIImageView = {
    let imageView = UIImageView(image: UIImage(named: "NativeLoginLogo")?.withRenderingMode(.alwaysTemplate))
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.contentMode = .scaleAspectFit
    imageView.setContentHuggingPriority(.required, for: .vertical)
    return imageView
  }()

  private let titleLabel: UILabel = {
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "Create here"
    label.textAlignment = .left
    label.textColor = .label
    label.font = .systemFont(ofSize: 26, weight: .bold)
    return label
  }()

  private let subtitleLabel: UILabel = {
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "Continue anywhere. Work across\niPhone, iPad, and desktop."
    label.textAlignment = .center
    label.textColor = .secondaryLabel
    label.font = .systemFont(ofSize: 20, weight: .regular)
    label.numberOfLines = 0
    label.adjustsFontSizeToFitWidth = true
    label.minimumScaleFactor = 0.86
    return label
  }()

  private lazy var proBenefitsButton: UIButton = {
    var title = AttributedString("See pro benefits")
    title.font = .systemFont(ofSize: 22, weight: .bold)

    var configuration = UIButton.Configuration.filled()
    configuration.attributedTitle = title
    configuration.image = UIImage(systemName: "bolt.fill")?.withTintColor(Self.boltColor, renderingMode: .alwaysOriginal)
    configuration.imagePlacement = .trailing
    configuration.imagePadding = 10
    configuration.baseForegroundColor = .white
    configuration.baseBackgroundColor = AffineColors.buttonPrimary.uiColor
    configuration.cornerStyle = .fixed
    configuration.background.cornerRadius = 10
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)

    let button = UIButton(configuration: configuration)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.addTarget(self, action: #selector(handleProBenefitsTapped), for: .touchUpInside)
    return button
  }()

  private lazy var continueFreeButton: UIButton = {
    let button = UIButton(type: .system)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.titleLabel?.font = .systemFont(ofSize: 20, weight: .medium)
    button.setTitle("Continue free", for: .normal)
    button.setTitleColor(.tertiaryLabel, for: .normal)
    button.addTarget(self, action: #selector(handleContinueFreeTapped), for: .touchUpInside)
    return button
  }()

  init() {
    super.init(nibName: nil, bundle: nil)
    overrideUserInterfaceStyle = Self.cachedUserInterfaceStyle
    modalPresentationStyle = .overFullScreen
    modalTransitionStyle = .crossDissolve
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    installContent()
    updateColors()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    showSheet()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    updateLayoutForCurrentSize()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateColors()
  }

  private func installContent() {
    let headerStackView = UIStackView(arrangedSubviews: [logoImageView, titleLabel])
    headerStackView.translatesAutoresizingMaskIntoConstraints = false
    headerStackView.axis = .horizontal
    headerStackView.alignment = .center
    headerStackView.spacing = 12

    let stackView = UIStackView(arrangedSubviews: [
      headerStackView,
      subtitleLabel,
      proBenefitsButton,
      continueFreeButton,
    ])
    stackView.translatesAutoresizingMaskIntoConstraints = false
    stackView.axis = .vertical
    stackView.alignment = .center
    stackView.spacing = 12
    stackView.setCustomSpacing(18, after: headerStackView)
    stackView.setCustomSpacing(30, after: subtitleLabel)
    stackView.setCustomSpacing(14, after: proBenefitsButton)

    dimmingView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleContinueFreeTapped)))

    view.addSubview(dimmingView)
    view.addSubview(sheetView)
    sheetView.addSubview(stackView)

    sheetBottomConstraint = sheetView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: currentSheetHeight)
    sheetHeightConstraint = sheetView.heightAnchor.constraint(equalToConstant: currentSheetHeight)
    stackTopConstraint = stackView.topAnchor.constraint(greaterThanOrEqualTo: sheetView.topAnchor, constant: isLandscapeLayout ? 16 : 26)
    stackCenterYConstraint = stackView.centerYAnchor.constraint(equalTo: sheetView.centerYAnchor, constant: isLandscapeLayout ? -8 : -10)
    logoWidthConstraint = logoImageView.widthAnchor.constraint(equalToConstant: isLandscapeLayout ? 34 : 44)
    logoHeightConstraint = logoImageView.heightAnchor.constraint(equalToConstant: isLandscapeLayout ? 34 : 44)
    buttonHeightConstraint = proBenefitsButton.heightAnchor.constraint(equalToConstant: isLandscapeLayout ? 48 : 58)
    continueFreeHeightConstraint = continueFreeButton.heightAnchor.constraint(equalToConstant: isLandscapeLayout ? 28 : 32)

    NSLayoutConstraint.activate([
      dimmingView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      dimmingView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      dimmingView.topAnchor.constraint(equalTo: view.topAnchor),
      dimmingView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      sheetView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sheetView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      sheetBottomConstraint!,
      sheetHeightConstraint!,

      stackTopConstraint!,
      stackCenterYConstraint!,
      stackView.centerXAnchor.constraint(equalTo: sheetView.centerXAnchor),
      stackView.leadingAnchor.constraint(greaterThanOrEqualTo: sheetView.leadingAnchor, constant: 31),
      stackView.trailingAnchor.constraint(lessThanOrEqualTo: sheetView.trailingAnchor, constant: -31),
      stackView.bottomAnchor.constraint(lessThanOrEqualTo: sheetView.safeAreaLayoutGuide.bottomAnchor, constant: -8),

      logoWidthConstraint!,
      logoHeightConstraint!,

      subtitleLabel.widthAnchor.constraint(lessThanOrEqualTo: sheetView.widthAnchor, constant: -62),

      proBenefitsButton.leadingAnchor.constraint(equalTo: sheetView.leadingAnchor, constant: 31),
      proBenefitsButton.trailingAnchor.constraint(equalTo: sheetView.trailingAnchor, constant: -31),
      buttonHeightConstraint!,

      continueFreeHeightConstraint!,
    ])
  }

  private func updateColors() {
    let traits = traitCollection
    let isDark = traits.userInterfaceStyle == .dark
    dimmingView.backgroundColor = UIColor.black.withAlphaComponent(isDark ? 0.48 : 0.28)
    sheetView.backgroundColor = AffineColors.layerBackgroundPrimary.uiColor.resolvedColor(with: traits)
    logoImageView.tintColor = AffineColors.textPrimary.uiColor.resolvedColor(with: traits)
    titleLabel.textColor = AffineColors.textPrimary.uiColor.resolvedColor(with: traits)
    subtitleLabel.textColor = AffineColors.textSecondary.uiColor.resolvedColor(with: traits)
    continueFreeButton.setTitleColor(AffineColors.textTertiary.uiColor.resolvedColor(with: traits), for: .normal)
    updateProBenefitsButtonConfiguration()
  }

  private func updateLayoutForCurrentSize() {
    let isLandscape = isLandscapeLayout
    sheetHeightConstraint?.constant = currentSheetHeight
    sheetBottomConstraint?.constant = didShowSheet ? 0 : currentSheetHeight
    stackTopConstraint?.constant = isLandscape ? 16 : 26
    stackCenterYConstraint?.constant = isLandscape ? -8 : -10
    logoWidthConstraint?.constant = isLandscape ? 34 : 44
    logoHeightConstraint?.constant = isLandscape ? 34 : 44
    buttonHeightConstraint?.constant = isLandscape ? 48 : 58
    continueFreeHeightConstraint?.constant = isLandscape ? 28 : 32
    titleLabel.font = .systemFont(ofSize: isLandscape ? 22 : 26, weight: .bold)
    subtitleLabel.font = .systemFont(ofSize: isLandscape ? 17 : 20, weight: .regular)
    continueFreeButton.titleLabel?.font = .systemFont(ofSize: isLandscape ? 18 : 20, weight: .medium)
    updateProBenefitsButtonConfiguration()
  }

  private func updateProBenefitsButtonConfiguration() {
    var title = AttributedString("See pro benefits")
    title.font = .systemFont(ofSize: isLandscapeLayout ? 19 : 22, weight: .bold)

    var configuration = proBenefitsButton.configuration ?? UIButton.Configuration.filled()
    configuration.attributedTitle = title
    configuration.image = UIImage(systemName: "bolt.fill")?.withTintColor(Self.boltColor, renderingMode: .alwaysOriginal)
    configuration.imagePlacement = .trailing
    configuration.imagePadding = 10
    configuration.baseForegroundColor = .white
    configuration.baseBackgroundColor = AffineColors.buttonPrimary.uiColor.resolvedColor(with: traitCollection)
    configuration.cornerStyle = .fixed
    configuration.background.cornerRadius = 10
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
    proBenefitsButton.configuration = configuration
  }

  private func showSheet() {
    guard !didShowSheet else { return }
    didShowSheet = true
    view.layoutIfNeeded()
    sheetBottomConstraint?.constant = 0

    UIView.animate(
      withDuration: 0.28,
      delay: 0,
      usingSpringWithDamping: 0.92,
      initialSpringVelocity: 0,
      options: [.curveEaseOut]
    ) { [weak self] in
      self?.dimmingView.alpha = 1
      self?.view.layoutIfNeeded()
    }
  }

  private func hideSheet(completion: @escaping () -> Void) {
    sheetBottomConstraint?.constant = currentSheetHeight

    UIView.animate(
      withDuration: 0.22,
      delay: 0,
      options: [.curveEaseIn]
    ) { [weak self] in
      self?.dimmingView.alpha = 0
      self?.view.layoutIfNeeded()
    } completion: { _ in
      completion()
    }
  }

  @objc
  private func handleProBenefitsTapped() {
    complete(.seeProBenefits, dismissFirst: true)
  }

  @objc
  private func handleContinueFreeTapped() {
    complete(.continueFree, dismissFirst: true)
  }

  private func complete(_ action: Action, dismissFirst: Bool) {
    guard !didResolve else { return }
    didResolve = true

    if dismissFirst {
      hideSheet { [weak self, onAction] in
        self?.dismiss(animated: false) {
          onAction?(action)
        }
      }
      return
    }

    onAction?(action)
  }
}

@objc
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
      userInfo: [NSLocalizedDescriptionKey: "AFFiNE home is still loading."]
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
      didRunColdStartPaywallFlow = true

      guard let webView = affineViewController?.webView else {
        showOnboardingAlert(message: "AFFiNE is still loading. Please try again in a moment.")
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
      title: "Onboarding",
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    (presentedViewController ?? self).present(alert, animated: true)
  }
}
