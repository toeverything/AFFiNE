import AuthenticationServices
import SwiftUI
import UIKit
import WebKit

final class NativeSignInViewController: UIViewController {
  var onComplete: ((Bool) -> Void)?

  private let viewModel: NativeSignInViewModel
  private let backgroundImageView: UIImageView = {
    let imageView = UIImageView(image: UIImage(named: "NativeLoginBackground"))
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    return imageView
  }()

  private let backgroundOverlayView: UIView = {
    let view = UIView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.isUserInteractionEnabled = false
    return view
  }()

  private var didComplete = false

  init(webView: WKWebView) {
    viewModel = NativeSignInViewModel(bridge: NativeSignInWebBridge(webView: webView))
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
    modalTransitionStyle = .coverVertical
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    installBackgroundViews()
    updateBackground(for: viewModel.appearance)

    viewModel.onFinished = { [weak self] isSignedIn in
      self?.finish(isSignedIn: isSignedIn)
    }
    viewModel.onAppearanceChanged = { [weak self] appearance in
      self?.updateBackground(for: appearance)
    }
    viewModel.loadAppearance()

    let hostingController = UIHostingController(rootView: NativeSignInView(viewModel: viewModel))
    addChild(hostingController)
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    hostingController.view.backgroundColor = .clear
    view.addSubview(hostingController.view)
    NSLayoutConstraint.activate([
      hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hostingController.didMove(toParent: self)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    updateBackgroundImageOffset()
  }

  private func installBackgroundViews() {
    view.addSubview(backgroundImageView)
    view.addSubview(backgroundOverlayView)
    NSLayoutConstraint.activate([
      backgroundImageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: -24),
      backgroundImageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: 24),
      backgroundImageView.topAnchor.constraint(equalTo: view.topAnchor, constant: -80),
      backgroundImageView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: 80),
      backgroundOverlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      backgroundOverlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      backgroundOverlayView.topAnchor.constraint(equalTo: view.topAnchor),
      backgroundOverlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  private func updateBackgroundImageOffset() {
    let isLandscape = view.bounds.width > view.bounds.height
    backgroundImageView.transform = CGAffineTransform(translationX: 0, y: isLandscape ? 14 : 34)
  }

  private func updateBackground(for appearance: NativeSignInAppearanceSnapshot) {
    let isDark = appearance.resolvedScheme == .dark
    view.backgroundColor = isDark
      ? UIColor(red: 0.30, green: 0.30, blue: 0.30, alpha: 1)
      : UIColor(red: 0.95, green: 0.95, blue: 0.95, alpha: 1)
    backgroundImageView.alpha = isDark ? 0.68 : 1
    backgroundOverlayView.backgroundColor = isDark
      ? UIColor.black.withAlphaComponent(0.34)
      : UIColor.white.withAlphaComponent(0.02)
  }

  private func finish(isSignedIn: Bool) {
    guard !didComplete else { return }
    didComplete = true
    view.isUserInteractionEnabled = false
    dismiss(animated: false) { [onComplete] in
      onComplete?(isSignedIn)
    }
  }
}

@MainActor
private final class NativeSignInViewModel: ObservableObject {
  enum Step {
    case signIn
    case password
    case magicCode
  }

  enum LoadingAction: Equatable {
    case googleOAuth
    case appleOAuth
    case email
    case password
    case magicCode
    case resendCode
    case selfHosted
  }

  @Published var step: Step = .signIn
  @Published var email = ""
  @Published var password = ""
  @Published var magicCode = ""
  @Published var isLoading = false
  @Published var loadingAction: LoadingAction?
  @Published var statusMessage: String?
  @Published var errorMessage: String?
  @Published var isSuccessFeedback = false
  @Published var appearance: NativeSignInAppearanceSnapshot {
    didSet {
      onAppearanceChanged?(appearance)
    }
  }

  var onFinished: ((Bool) -> Void)?
  var onAppearanceChanged: ((NativeSignInAppearanceSnapshot) -> Void)?

  private let bridge: NativeSignInWebBridge

  init(bridge: NativeSignInWebBridge) {
    self.bridge = bridge
    appearance = NativeSignInAppearanceSnapshot(cachedSystemInterfaceStyle: UITraitCollection.current.userInterfaceStyle)
  }

  func loadAppearance() {
    Task { @MainActor in
      do {
        appearance = try await bridge.getAppearanceSnapshot()
      } catch {
        appearance = NativeSignInAppearanceSnapshot(cachedSystemInterfaceStyle: UITraitCollection.current.userInterfaceStyle)
      }
    }
  }

  var canContinueWithEmail: Bool {
    isValidEmail(email)
  }

  var canContinueWithPassword: Bool {
    !password.isEmpty
  }

  var canContinueWithCode: Bool {
    magicCode.count == 6 && magicCode.allSatisfy { $0.isNumber }
  }

  func close() {
    onFinished?(false)
  }

  func isProviderLoading(_ provider: NativeOAuthProvider) -> Bool {
    loadingAction == loadingAction(for: provider)
  }

  func isActionLoading(_ action: LoadingAction) -> Bool {
    loadingAction == action
  }

  func startOAuth(provider: NativeOAuthProvider) {
    guard !isLoading else { return }
    beginLoading(loadingAction(for: provider), status: "Waiting for \(provider.rawValue) sign-in...")

    Task { @MainActor in
      do {
        try await bridge.startOAuth(provider: provider)
        statusMessage = "Finishing sign-in..."
        if try await bridge.waitForAuthenticated() != nil {
          await showSuccessAndFinish()
          return
        }
        showError("Unable to sign in. Please try again.")
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  func continueWithEmail() {
    guard !isLoading else { return }
    email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canContinueWithEmail else {
      showError("Enter a valid email address.")
      return
    }

    beginLoading(.email, status: "Checking sign-in method...")

    Task { @MainActor in
      do {
        let methods = try await bridge.checkEmailMethods(email: email)
        if methods.hasPassword {
          step = .password
          statusMessage = nil
        } else if methods.canUseMagicLink {
          try await bridge.sendMagicLink(email: email)
          magicCode = ""
          step = .magicCode
          statusMessage = "We sent a sign-in code to \(email)."
        } else {
          showError("This email is not available for sign-in.")
        }
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  func signInWithPassword() {
    guard !isLoading else { return }
    guard canContinueWithPassword else {
      showError("Enter your password.")
      return
    }

    beginLoading(.password, status: "Signing in...")

    Task { @MainActor in
      do {
        _ = try await bridge.signInWithPassword(email: email, password: password)
        await showSuccessAndFinish()
        return
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  func signInWithMagicCode() {
    guard !isLoading else { return }
    guard canContinueWithCode else {
      showError("Enter the 6-digit sign-in code.")
      return
    }

    beginLoading(.magicCode, status: "Verifying sign-in code...")

    Task { @MainActor in
      do {
        _ = try await bridge.signInWithMagicLink(email: email, token: magicCode)
        await showSuccessAndFinish()
        return
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  func resendMagicCode() {
    guard !isLoading else { return }
    beginLoading(.resendCode, status: "Sending a new code...")

    Task { @MainActor in
      do {
        try await bridge.sendMagicLink(email: email)
        statusMessage = "We sent a new sign-in code to \(email)."
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  func openSelfHosted() {
    guard !isLoading else { return }
    beginLoading(.selfHosted, status: "Opening self-hosted sign-in...")

    Task { @MainActor in
      do {
        try await bridge.openSelfHostedSignIn()
        onFinished?(false)
        return
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  private func loadingAction(for provider: NativeOAuthProvider) -> LoadingAction {
    switch provider {
    case .google:
      return .googleOAuth
    case .apple:
      return .appleOAuth
    }
  }

  private func beginLoading(_ action: LoadingAction, status: String? = nil) {
    isLoading = true
    loadingAction = action
    statusMessage = status
    errorMessage = nil
    isSuccessFeedback = false
  }

  private func finishLoading() {
    isLoading = false
    loadingAction = nil
  }

  private func showError(_ error: Error) {
    showError(error.localizedDescription)
  }

  private func showError(_ message: String) {
    errorMessage = message
    statusMessage = nil
    isSuccessFeedback = false
  }

  private func showSuccessAndFinish() async {
    finishLoading()
    errorMessage = nil
    isSuccessFeedback = true
    statusMessage = "Sign in Success"
    try? await Task.sleep(nanoseconds: 1_150_000_000)
    onFinished?(true)
  }

  private func isValidEmail(_ value: String) -> Bool {
    let pattern = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
    return value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
  }
}

private enum NativeSignInAppearanceSetting: String {
  case system
  case light
  case dark
}

private struct NativeSignInAppearanceSnapshot {
  let setting: NativeSignInAppearanceSetting
  let resolvedScheme: ColorScheme

  init(setting: NativeSignInAppearanceSetting, resolvedScheme: ColorScheme) {
    self.setting = setting
    self.resolvedScheme = resolvedScheme
  }

  init(systemInterfaceStyle: UIUserInterfaceStyle) {
    setting = .system
    resolvedScheme = systemInterfaceStyle == .dark ? .dark : .light
  }

  init(cachedSystemInterfaceStyle systemInterfaceStyle: UIUserInterfaceStyle) {
    let cachedSetting = NativeSignInAppearanceSetting(rawValue: UserDefaults.standard.string(forKey: AffineThemeStorage.modeKey) ?? "") ?? .system
    setting = cachedSetting
    switch cachedSetting {
    case .dark:
      resolvedScheme = .dark
    case .light:
      resolvedScheme = .light
    case .system:
      resolvedScheme = systemInterfaceStyle == .dark ? .dark : .light
    }
  }

  func effectiveScheme(systemScheme: ColorScheme) -> ColorScheme {
    setting == .system ? systemScheme : resolvedScheme
  }

  var preferredColorScheme: ColorScheme? {
    switch setting {
    case .system:
      return nil
    case .light:
      return .light
    case .dark:
      return .dark
    }
  }
}

private struct NativeSignInPalette {
  let colorScheme: ColorScheme

  private var isDark: Bool {
    colorScheme == .dark
  }

  var usesDarkStyle: Bool {
    isDark
  }

  var background: Color {
    isDark ? Color(red: 0.30, green: 0.30, blue: 0.30) : Color(red: 0.95, green: 0.95, blue: 0.95)
  }

  var backgroundOverlay: Color {
    isDark ? Color.black.opacity(0.34) : Color.white.opacity(0.02)
  }

  var backgroundImageOpacity: Double {
    isDark ? 0.68 : 1
  }

  var dotColor: Color {
    isDark ? Color.white.opacity(0.12) : Color.clear
  }

  var logoTint: Color {
    isDark ? Color.white.opacity(0.94) : Color(red: 0.12, green: 0.12, blue: 0.12)
  }

  var primaryText: Color {
    isDark ? Color(red: 0.95, green: 0.95, blue: 0.96) : Color(red: 0.12, green: 0.12, blue: 0.12)
  }

  var secondaryText: Color {
    isDark ? Color(red: 0.72, green: 0.72, blue: 0.74) : Color(red: 0.22, green: 0.22, blue: 0.22)
  }

  var placeholderText: Color {
    isDark ? Color.white.opacity(0.58) : Color(red: 0.55, green: 0.55, blue: 0.55)
  }

  var tertiaryText: Color {
    isDark ? Color(red: 0.62, green: 0.62, blue: 0.64) : Color(red: 0.55, green: 0.55, blue: 0.55)
  }

  var inputBackground: Color {
    isDark ? Color(red: 0.25, green: 0.25, blue: 0.25) : Color(red: 0.88, green: 0.88, blue: 0.88)
  }

  var readonlyInputBackground: Color {
    isDark ? Color(red: 0.22, green: 0.22, blue: 0.22) : Color(red: 0.90, green: 0.90, blue: 0.90)
  }

  var divider: Color {
    isDark ? Color.white.opacity(0.12) : Color(red: 0.86, green: 0.86, blue: 0.86)
  }

  var accent: Color {
    isDark ? Color(red: 0.43, green: 0.78, blue: 1.0) : Color(red: 0.0, green: 0.43, blue: 1.0)
  }

  var successText: Color {
    isDark ? Color(red: 0.44, green: 0.86, blue: 0.57) : Color(red: 0.10, green: 0.58, blue: 0.25)
  }

  var hudBackground: Color {
    isDark ? Color.white.opacity(0.10) : Color.white.opacity(0.72)
  }

  var hudBorder: Color {
    isDark ? Color.white.opacity(0.16) : Color.white.opacity(0.86)
  }

  var hudIconBackground: Color {
    isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
  }

  var hudLoadingTrack: Color {
    isDark ? Color.white.opacity(0.13) : Color.black.opacity(0.07)
  }

  var hudGradientEnd: Color {
    isDark ? Color(red: 0.68, green: 0.45, blue: 1.0) : Color(red: 0.62, green: 0.30, blue: 0.96)
  }

  var hudShadow: Color {
    isDark ? Color.black.opacity(0.32) : Color.black.opacity(0.14)
  }

  var closeIcon: Color {
    isDark ? Color.white.opacity(0.92) : Color(red: 0.18, green: 0.18, blue: 0.18)
  }

  var closeButtonBackground: Color {
    isDark ? Color(red: 0.16, green: 0.16, blue: 0.16).opacity(0.92) : Color.white.opacity(0.94)
  }

  var closeButtonCornerRadius: CGFloat {
    isDark ? 13 : 22
  }

  var controlShadow: Color {
    isDark ? Color.black.opacity(0.10) : Color.black.opacity(0.08)
  }

  var inputCornerRadius: CGFloat {
    isDark ? 6 : 10
  }

  var inputHeight: CGFloat {
    isDark ? 44 : 47
  }

  var authButtonHeight: CGFloat {
    isDark ? 44 : 52
  }

  var emailButtonHeight: CGFloat {
    isDark ? 44 : 50
  }

  var authButtonCornerRadius: CGFloat {
    isDark ? 7 : 26
  }

  var emailButtonCornerRadius: CGFloat {
    isDark ? 7 : 25
  }

  var emailButtonBackground: Color {
    isDark ? Color(red: 0.28, green: 0.28, blue: 0.28) : Color.white.opacity(0.96)
  }

  var emailButtonText: Color {
    isDark ? Color.white.opacity(0.92) : Color(red: 0.10, green: 0.10, blue: 0.10)
  }

  var googleButtonBackground: Color {
    Color(red: 0.11, green: 0.58, blue: 0.91)
  }

  var appleButtonBackground: Color {
    isDark ? Color.black.opacity(0.05) : Color.black
  }

  var appleButtonForeground: Color {
    Color.white
  }

  var appleButtonBorder: Color {
    isDark ? Color.white.opacity(0.82) : Color.clear
  }

  var appleButtonBorderWidth: CGFloat {
    isDark ? 1 : 0
  }

  var primaryDisabledBackground: Color {
    isDark ? Color(red: 0.28, green: 0.28, blue: 0.28) : Color.gray.opacity(0.5)
  }

  var legalFrameAlignment: Alignment {
    isDark ? .leading : .center
  }

  var legalTextAlignment: TextAlignment {
    isDark ? .leading : .center
  }
}

private enum NativeOAuthProvider: String {
  case google = "Google"
  case apple = "Apple"
}

private final class NativeSignInPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }
}

@MainActor
private final class NativeSignInWebBridge {
  struct EmailMethods {
    let hasPassword: Bool
    let canUseMagicLink: Bool
  }

  private weak var webView: WKWebView?
  private let presentationContextProvider = NativeSignInPresentationContextProvider()
  private let pollIntervalNanoseconds: UInt64 = 200_000_000
  private var authenticationSession: ASWebAuthenticationSession?

  init(webView: WKWebView) {
    self.webView = webView
  }

  func getAppearanceSnapshot() async throws -> NativeSignInAppearanceSnapshot {
    let result = try await call(
      """
      const rawSetting = window.localStorage?.getItem('theme');
      const setting = ['system', 'light', 'dark'].includes(rawSetting) ? rawSetting : 'system';
      const nativeTheme = typeof window.getCurrentThemeMode === 'function' ? window.getCurrentThemeMode() : undefined;
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const resolved = setting === 'dark' || setting === 'light'
        ? setting
        : ['light', 'dark'].includes(nativeTheme)
          ? nativeTheme
          : ['light', 'dark'].includes(dataTheme)
            ? dataTheme
            : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light';
      return { setting, resolved };
      """,
      arguments: [:]
    )

    guard let snapshot = result as? [String: Any] else {
      throw signInError("Unable to read appearance setting.")
    }

    let setting = NativeSignInAppearanceSetting(rawValue: snapshot["setting"] as? String ?? "system") ?? .system
    let resolvedScheme: ColorScheme = snapshot["resolved"] as? String == "dark" ? .dark : .light
    return NativeSignInAppearanceSnapshot(setting: setting, resolvedScheme: resolvedScheme)
  }

  func startOAuth(provider: NativeOAuthProvider) async throws {
    let result = try await call(
      "return await window.nativeStartOAuthSignIn(provider);",
      arguments: ["provider": provider.rawValue]
    )

    guard
      let urlString = result as? String,
      let url = URL(string: urlString)
    else {
      throw signInError("Unable to start OAuth sign-in.")
    }

    let callbackURL = try await openAuthenticationSession(url: url)
    try await handleAuthenticationCallback(url: callbackURL)
  }

  private func openAuthenticationSession(url: URL) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "affine") { [weak self] callbackURL, error in
        Task { @MainActor in
          self?.authenticationSession = nil

          if let callbackURL {
            continuation.resume(returning: callbackURL)
            return
          }

          if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
            continuation.resume(throwing: self?.signInError("Sign-in was cancelled.") ?? NSError())
            return
          }

          if let error {
            continuation.resume(throwing: error)
            return
          }

          continuation.resume(throwing: self?.signInError("Unable to complete OAuth sign-in.") ?? NSError())
        }
      }
      session.presentationContextProvider = presentationContextProvider
      session.prefersEphemeralWebBrowserSession = false
      authenticationSession = session

      if !session.start() {
        authenticationSession = nil
        continuation.resume(throwing: signInError("Unable to open OAuth sign-in."))
      }
    }
  }

  private func handleAuthenticationCallback(url: URL) async throws {
    _ = try await call(
      "return await window.nativeHandleAuthenticationCallback(url);",
      arguments: ["url": url.absoluteString]
    )
  }

  func checkEmailMethods(email: String) async throws -> EmailMethods {
    let result = try await call(
      "return await window.nativeCheckEmailSignInMethods(email);",
      arguments: ["email": email]
    )

    guard let methods = result as? [String: Any] else {
      throw signInError("Unable to check available sign-in methods.")
    }

    return EmailMethods(
      hasPassword: methods["hasPassword"] as? Bool == true,
      canUseMagicLink: methods["canUseMagicLink"] as? Bool == true
    )
  }

  func sendMagicLink(email: String) async throws {
    _ = try await call(
      "return await window.nativeSendEmailMagicLink(email);",
      arguments: ["email": email]
    )
  }

  func signInWithMagicLink(email: String, token: String) async throws -> String {
    try await signedInIdentifier(
      script: "return await window.nativeSignInWithMagicLink(email, token);",
      arguments: ["email": email, "token": token]
    )
  }

  func signInWithPassword(email: String, password: String) async throws -> String {
    try await signedInIdentifier(
      script: "return await window.nativeSignInWithPassword(email, password);",
      arguments: ["email": email, "password": password]
    )
  }

  func openSelfHostedSignIn() async throws {
    _ = try await call(
      "return await window.nativeOpenSelfHostedSignIn();",
      arguments: [:]
    )
  }

  func waitForAuthenticated(timeout: TimeInterval = 5 * 60) async throws -> String? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let identifier = try await currentUserIdentifier() {
        return identifier
      }
      try await Task.sleep(nanoseconds: pollIntervalNanoseconds)
    }
    return nil
  }

  private func signedInIdentifier(script: String, arguments: [String: Any]) async throws -> String {
    let result = try await call(script, arguments: arguments)
    guard let identifier = userIdentifier(from: result) else {
      throw signInError("Unable to complete sign-in.")
    }
    return identifier
  }

  private func currentUserIdentifier() async throws -> String? {
    let result = try await call(
      "return window.getCurrentUserIdentifier?.();",
      arguments: [:]
    )
    return userIdentifier(from: result)
  }

  private func call(_ script: String, arguments: [String: Any]) async throws -> Any? {
    guard let webView else {
      throw signInError("AFFiNE is still loading. Please try again in a moment.")
    }

    return try await webView.callAsyncJavaScript(
      script,
      arguments: arguments,
      contentWorld: .page
    )
  }

  private func userIdentifier(from result: Any?) -> String? {
    guard let identifier = result as? String else { return nil }
    let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func signInError(_ message: String) -> NSError {
    NSError(
      domain: "NativeSignIn",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}

private struct NativeSignInView: View {
  @ObservedObject var viewModel: NativeSignInViewModel
  @Environment(\.openURL) private var openURL
  @Environment(\.colorScheme) private var systemColorScheme

  private var palette: NativeSignInPalette {
    NativeSignInPalette(colorScheme: viewModel.appearance.effectiveScheme(systemScheme: systemColorScheme))
  }

  var body: some View {
    GeometryReader { geometry in
      let layout = NativeSignInLayout(
        size: geometry.size,
        safeAreaInsets: geometry.safeAreaInsets
      )
      ZStack(alignment: .top) {
        ScrollView(.vertical, showsIndicators: false) {
          VStack(spacing: 0) {
            Color.clear
              .frame(height: layout.headerHeight)

            VStack(alignment: .leading, spacing: layout.contentSpacing) {
              titleSection

              switch viewModel.step {
              case .signIn:
                signInStep
              case .password:
                passwordStep
              case .magicCode:
                magicCodeStep
              }
            }
            .padding(.horizontal, layout.horizontalPadding)
            .padding(.bottom, layout.bottomPadding)
            .frame(maxWidth: layout.maxContentWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
          }
          .frame(minHeight: geometry.size.height, alignment: .top)
        }
        .zIndex(2)

        if palette.usesDarkStyle {
          LoginDotOverlay(dotColor: palette.dotColor)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .zIndex(1)
        } else {
          LoginRedGridOverlay()
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .zIndex(10)
        }

        Button(action: viewModel.close) {
          Image(systemName: "xmark")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(palette.closeIcon)
            .frame(width: 44, height: 44)
            .background(palette.closeButtonBackground)
            .clipShape(RoundedRectangle(cornerRadius: palette.closeButtonCornerRadius, style: .continuous))
            .shadow(color: palette.controlShadow, radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.top, layout.closeButtonTopPadding)
        .padding(.trailing, layout.closeButtonTrailingPadding)
        .frame(maxWidth: .infinity, alignment: .topTrailing)
        .zIndex(11)

        if viewModel.isLoading || viewModel.isSuccessFeedback {
          NativeSignInHUDView(
            message: viewModel.isSuccessFeedback ? "Sign in Success" : "Logging in...",
            isSuccess: viewModel.isSuccessFeedback,
            palette: palette
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
          .transition(.opacity.combined(with: .scale(scale: 0.96)))
          .zIndex(12)
        }
      }
      .animation(.easeInOut(duration: 0.16), value: viewModel.isLoading)
      .animation(.easeInOut(duration: 0.16), value: viewModel.isSuccessFeedback)
      .frame(width: geometry.size.width, height: geometry.size.height)
    }
    .preferredColorScheme(viewModel.appearance.preferredColorScheme)
  }

  private var signInHeader: some View {
    ZStack {
      NativeSignInDottedBackground()
      DecorativeShape(kind: .plane)
        .frame(width: 150, height: 108)
        .rotationEffect(.degrees(-14))
        .offset(x: -160, y: -30)
      DecorativeShape(kind: .cloud)
        .frame(width: 104, height: 66)
        .offset(x: -10, y: 52)
      DecorativeShape(kind: .shield)
        .frame(width: 96, height: 98)
        .rotationEffect(.degrees(-8))
        .offset(x: 156, y: 20)
    }
    .clipped()
  }

  private var titleSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Image("NativeLoginLogo")
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
          .foregroundStyle(palette.logoTint)
          .frame(width: 36, height: 36)
        Text("Sign in")
          .font(.system(size: 24, weight: .bold))
          .foregroundStyle(palette.primaryText)
      }
      Text("AFFiNE Cloud")
        .font(.system(size: 23, weight: .bold))
        .foregroundStyle(palette.primaryText)
    }
  }

  private var signInStep: some View {
    VStack(alignment: .leading, spacing: 13) {
      OAuthButton(
        provider: .google,
        palette: palette,
        isLoading: viewModel.isProviderLoading(.google),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.startOAuth(provider: .google)
      }
      OAuthButton(
        provider: .apple,
        palette: palette,
        isLoading: viewModel.isProviderLoading(.apple),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.startOAuth(provider: .apple)
      }

      VStack(alignment: .leading, spacing: 10) {
        Text("Email")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(palette.secondaryText)
        TextField(
          "",
          text: $viewModel.email,
          prompt: Text("Enter your email address").foregroundColor(palette.placeholderText)
        )
          .keyboardType(.emailAddress)
          .textContentType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(.system(size: 16, weight: .regular))
          .foregroundStyle(palette.primaryText)
          .tint(palette.accent)
          .padding(.horizontal, 16)
          .frame(height: palette.inputHeight)
          .background(palette.inputBackground)
          .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
          .submitLabel(.continue)
          .onSubmit(viewModel.continueWithEmail)
      }
      .padding(.top, 8)

      EmailContinueButton(
        palette: palette,
        isLoading: viewModel.isActionLoading(.email),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.continueWithEmail()
      }

      feedbackText

      legalText
        .padding(.top, 8)

      divider
        .padding(.vertical, 2)

      FooterLinkButton(systemName: "globe", title: "Connect to a Self-Hosted Instance", palette: palette) {
        viewModel.openSelfHosted()
      }
      FooterLinkButton(systemName: "person.crop.square", title: "Start AFFiNE without an account", palette: palette) {
        viewModel.close()
      }
    }
  }

  private var passwordStep: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Email")
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
      Text(viewModel.email)
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: palette.inputHeight)
        .background(palette.readonlyInputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))

      SecureField(
        "",
        text: $viewModel.password,
        prompt: Text("Enter your password").foregroundColor(palette.placeholderText)
      )
        .textContentType(.password)
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(palette.primaryText)
        .tint(palette.accent)
        .padding(.horizontal, 16)
        .frame(height: palette.inputHeight)
        .background(palette.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
        .submitLabel(.go)
        .onSubmit(viewModel.signInWithPassword)

      PrimaryNativeSignInButton(
        title: "Continue",
        palette: palette,
        isLoading: viewModel.isActionLoading(.password),
        isEnabled: viewModel.canContinueWithPassword,
        isDisabled: viewModel.isLoading,
        action: viewModel.signInWithPassword
      )

      Button("Use email code instead") {
        viewModel.resendMagicCode()
        viewModel.step = .magicCode
      }
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(palette.accent)
      .buttonStyle(.plain)

      feedbackText
    }
  }

  private var magicCodeStep: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Enter the code sent to")
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
      Text(viewModel.email)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)

      TextField(
        "",
        text: $viewModel.magicCode,
        prompt: Text("6-digit code").foregroundColor(palette.placeholderText)
      )
        .keyboardType(.numberPad)
        .textContentType(.oneTimeCode)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .tint(palette.accent)
        .padding(.horizontal, 16)
        .frame(height: palette.inputHeight)
        .background(palette.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
        .onChange(of: viewModel.magicCode) { value in
          viewModel.magicCode = String(value.prefix(6))
        }

      PrimaryNativeSignInButton(
        title: "Continue",
        palette: palette,
        isLoading: viewModel.isActionLoading(.magicCode),
        isEnabled: viewModel.canContinueWithCode,
        isDisabled: viewModel.isLoading,
        action: viewModel.signInWithMagicCode
      )

      Button("Resend code") {
        viewModel.resendMagicCode()
      }
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(palette.accent)
      .buttonStyle(.plain)

      feedbackText
    }
  }

  private var legalText: some View {
    VStack(alignment: palette.usesDarkStyle ? .leading : .center, spacing: 3) {
      Text("By clicking \"Continue with Google/Email\" above, you")
      Text("acknowledge that you agree to AFFiNE's")
      HStack(spacing: 3) {
        LegalLinkButton(title: "Terms of Conditions", palette: palette) {
          openLegalURL("https://affine.pro/terms")
        }
        Text("and")
        LegalLinkButton(title: "Privacy Policy", palette: palette) {
          openLegalURL("https://affine.pro/privacy")
        }
        Text(".")
      }
    }
    .font(.system(size: 12, weight: .medium))
    .foregroundStyle(palette.tertiaryText)
    .frame(maxWidth: .infinity, alignment: palette.legalFrameAlignment)
    .multilineTextAlignment(palette.legalTextAlignment)
  }

  private var divider: some View {
    HStack(spacing: 14) {
      Rectangle()
        .fill(palette.divider)
        .frame(height: 1)
      Text("Or")
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(palette.secondaryText)
      Rectangle()
        .fill(palette.divider)
        .frame(height: 1)
    }
  }

  @ViewBuilder
  private var feedbackText: some View {
    if let errorMessage = viewModel.errorMessage {
      Text(errorMessage)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.red)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if let statusMessage = viewModel.statusMessage {
      HStack(spacing: 8) {
        if viewModel.isLoading {
          ProgressView()
            .tint(palette.accent)
        }
        Text(statusMessage)
          .font(.system(size: 13, weight: .medium))
      }
      .foregroundStyle(viewModel.isSuccessFeedback ? palette.successText : palette.tertiaryText)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func openLegalURL(_ urlString: String) {
    guard let url = URL(string: urlString) else { return }
    openURL(url)
  }
}

private struct NativeSignInLayout {
  let size: CGSize
  let safeAreaInsets: EdgeInsets

  private var isLandscape: Bool {
    size.width > size.height
  }

  private var isPadLike: Bool {
    min(size.width, size.height) >= 700
  }

  var headerHeight: CGFloat {
    if isLandscape {
      return isPadLike ? 170 : 118
    }
    return isPadLike ? 250 : 226
  }

  var contentSpacing: CGFloat {
    isLandscape && !isPadLike ? 14 : 20
  }

  var horizontalPadding: CGFloat {
    isLandscape ? 24 : 20
  }

  var bottomPadding: CGFloat {
    max(safeAreaInsets.bottom + (isLandscape ? 16 : 18), isLandscape ? 24 : 34)
  }

  var maxContentWidth: CGFloat {
    if isPadLike {
      return 460
    }
    return isLandscape ? 520 : 420
  }

  var backgroundVerticalOffset: CGFloat {
    isLandscape ? 14 : 34
  }

  var closeButtonTopPadding: CGFloat {
    safeAreaInsets.top + max((44 - closeButtonSize) / 2, 0)
  }

  var closeButtonTrailingPadding: CGFloat {
    max(safeAreaInsets.trailing + 8, 12)
  }

  private var closeButtonSize: CGFloat {
    44
  }
}

private struct NativeSignInHUDView: View {
  let message: String
  let isSuccess: Bool
  let palette: NativeSignInPalette

  @State private var successProgress: CGFloat = 0
  @State private var successCheckScale: CGFloat = 0.56
  @State private var successCheckOpacity: Double = 0
  @State private var isSuccessAnimationSettled = false

  private var usesCompactSuccessLayout: Bool {
    isSuccess && isSuccessAnimationSettled
  }

  var body: some View {
    content
      .padding(.horizontal, usesCompactSuccessLayout ? 10 : 24)
      .padding(.vertical, usesCompactSuccessLayout ? 10 : 22)
      .background {
        RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
              .fill(palette.hudBackground)
          }
      }
      .overlay {
        RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
          .stroke(palette.hudBorder, lineWidth: 1)
      }
      .shadow(color: palette.hudShadow, radius: 24, x: 0, y: 14)
      .shadow(color: palette.controlShadow, radius: 6, x: 0, y: 2)
      .allowsHitTesting(false)
      .onAppear {
        guard isSuccess else { return }
        startSuccessAnimation()
      }
      .onChange(of: isSuccess) { value in
        if value {
          startSuccessAnimation()
        } else {
          resetSuccessAnimation()
        }
      }
  }

  @ViewBuilder
  private var content: some View {
    if isSuccess {
      if isSuccessAnimationSettled {
        successContent
      } else {
        animatedSuccessContent
      }
    } else {
      loadingContent
    }
  }

  private var loadingContent: some View {
    VStack(spacing: 14) {
      NativeSignInLoadingRing(palette: palette)

      Text(message)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private var animatedSuccessContent: some View {
    VStack(spacing: 14) {
      NativeSignInSuccessRing(
        palette: palette,
        progress: successProgress,
        checkScale: successCheckScale,
        checkOpacity: successCheckOpacity
      )

      Text(message)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private var successContent: some View {
    HStack(spacing: 12) {
      ZStack {
        Circle()
          .fill(palette.successText.opacity(0.14))
          .frame(width: 34, height: 34)

        Image(systemName: "checkmark")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(palette.successText)
      }

      Text(message)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private func startSuccessAnimation() {
    resetSuccessAnimation()
    withAnimation(.easeOut(duration: 0.28)) {
      successProgress = 1
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
      withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) {
        successCheckScale = 1
        successCheckOpacity = 1
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.76) {
      withAnimation(.easeInOut(duration: 0.18)) {
        isSuccessAnimationSettled = true
      }
    }
  }

  private func resetSuccessAnimation() {
    successProgress = 0
    successCheckScale = 0.56
    successCheckOpacity = 0
    isSuccessAnimationSettled = false
  }
}

private struct NativeSignInSuccessRing: View {
  let palette: NativeSignInPalette
  let progress: CGFloat
  let checkScale: CGFloat
  let checkOpacity: Double

  var body: some View {
    ZStack {
      Circle()
        .stroke(palette.hudLoadingTrack, lineWidth: 7)
        .frame(width: 76, height: 76)

      Circle()
        .trim(from: 0, to: progress)
        .stroke(
          LinearGradient(
            colors: [palette.accent, palette.hudGradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 7, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(-90))

      Image(systemName: "checkmark")
        .font(.system(size: 32, weight: .bold))
        .foregroundStyle(palette.successText)
        .scaleEffect(checkScale)
        .opacity(checkOpacity)
    }
  }
}

private struct NativeSignInLoadingRing: View {
  let palette: NativeSignInPalette

  @State private var rotation: Double = -90
  @State private var pulseScale: CGFloat = 0.94
  @State private var pulseOpacity: Double = 0.44

  var body: some View {
    ZStack {
      Circle()
        .stroke(palette.hudLoadingTrack, lineWidth: 6.5)
        .frame(width: 76, height: 76)

      Circle()
        .trim(from: 0.06, to: 0.36)
        .stroke(
          LinearGradient(
            colors: [palette.accent, palette.hudGradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 7, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(rotation))
        .shadow(color: palette.accent.opacity(0.26), radius: 7, x: 0, y: 0)

      Circle()
        .trim(from: 0.58, to: 0.72)
        .stroke(
          LinearGradient(
            colors: [palette.hudGradientEnd.opacity(0.72), palette.accent.opacity(0.22)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 4.5, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(rotation + 12))

      Circle()
        .fill(
          RadialGradient(
            colors: [palette.accent.opacity(0.20), Color.clear],
            center: .center,
            startRadius: 0,
            endRadius: 26
          )
        )
        .frame(width: 52, height: 52)
        .scaleEffect(pulseScale)
        .opacity(pulseOpacity)

      Circle()
        .fill(palette.accent.opacity(0.82))
        .frame(width: 5.5, height: 5.5)
        .scaleEffect(pulseScale)
        .opacity(0.86)
    }
    .onAppear {
      rotation = -90
      pulseScale = 0.94
      pulseOpacity = 0.44
      withAnimation(.linear(duration: 1.08).repeatForever(autoreverses: false)) {
        rotation = 270
      }
      withAnimation(.easeInOut(duration: 0.92).repeatForever(autoreverses: true)) {
        pulseScale = 1.12
        pulseOpacity = 0.72
      }
    }
  }
}

private struct LoginDotOverlay: View {
  let dotColor: Color
  private let spacing: CGFloat = 13
  private let dotSize: CGFloat = 2.2

  var body: some View {
    Canvas { context, size in
      let dot = Path(ellipseIn: CGRect(x: 0, y: 0, width: dotSize, height: dotSize))
      for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
        for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
          context.fill(
            dot.applying(CGAffineTransform(translationX: x, y: y)),
            with: .color(dotColor)
          )
        }
      }
    }
  }
}

private struct LoginRedGridOverlay: View {
  private let spacing: CGFloat = 12

  var body: some View {
    GeometryReader { geometry in
      let drawWidth = geometry.size.width
      let drawHeight = geometry.size.height

      Path { path in
        stride(from: 0, through: drawWidth, by: spacing).forEach { x in
          path.move(to: CGPoint(x: x, y: 0))
          path.addLine(to: CGPoint(x: x, y: drawHeight))
        }

        stride(from: 0, through: drawHeight, by: spacing).forEach { y in
          path.move(to: CGPoint(x: 0, y: y))
          path.addLine(to: CGPoint(x: drawWidth, y: y))
        }
      }
      .stroke(Color.red.opacity(0.4), lineWidth: 0.4)
      .frame(width: drawWidth, height: drawHeight, alignment: .topLeading)
    }
  }
}

private struct OAuthButton: View {
  let provider: NativeOAuthProvider
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isDisabled: Bool
  let action: () -> Void

  private var foreground: Color {
    provider == .google ? .white : palette.appleButtonForeground
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 13) {
        if isLoading {
          ProgressView()
            .tint(foreground)
            .frame(width: 28, height: 28)
        } else {
          providerIcon
            .frame(width: 28, height: 28)
        }
        Text(provider == .google ? "Continue with Google" : "Continue with Apple")
          .font(.system(size: 18, weight: .medium))
      }
      .foregroundStyle(foreground)
      .frame(maxWidth: .infinity)
      .frame(height: palette.authButtonHeight)
      .background(provider == .google ? palette.googleButtonBackground : palette.appleButtonBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.authButtonCornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: palette.authButtonCornerRadius, style: .continuous)
          .stroke(provider == .apple ? palette.appleButtonBorder : Color.clear, lineWidth: palette.appleButtonBorderWidth)
      }
      .shadow(color: palette.controlShadow.opacity(0.7), radius: 8, x: 0, y: 3)
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled && !isLoading ? 0.62 : 1)
  }

  @ViewBuilder
  private var providerIcon: some View {
    if provider == .google {
      Text("G")
        .font(.system(size: 32, weight: .bold))
        .foregroundStyle(.white)
    } else {
      Image(systemName: "apple.logo")
        .font(.system(size: 28, weight: .semibold))
        .foregroundStyle(foreground)
    }
  }
}

private struct EmailContinueButton: View {
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isDisabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if isLoading {
          ProgressView()
            .tint(palette.accent)
        }
        Text("Continue with Email")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(palette.emailButtonText)
        Image(systemName: "arrow.right")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(palette.accent)
      }
      .frame(maxWidth: .infinity)
      .frame(height: palette.emailButtonHeight)
      .background(palette.emailButtonBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.emailButtonCornerRadius, style: .continuous))
      .shadow(color: palette.controlShadow.opacity(0.65), radius: 10, x: 0, y: 4)
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled && !isLoading ? 0.62 : 1)
  }
}

private struct LegalLinkButton: View {
  let title: String
  let palette: NativeSignInPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12, weight: .medium))
        .underline(true, color: palette.accent)
        .foregroundStyle(palette.accent)
    }
    .buttonStyle(.plain)
  }
}

private struct PrimaryNativeSignInButton: View {
  let title: String
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isEnabled: Bool
  let isDisabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if isLoading {
          ProgressView()
            .tint(.white)
        }
        Text(title)
          .font(.system(size: 17, weight: .bold))
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity)
      .frame(height: palette.emailButtonHeight)
      .background(isEnabled && (!isDisabled || isLoading) ? palette.accent : palette.primaryDisabledBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.emailButtonCornerRadius, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled || isDisabled)
  }
}

private struct FooterLinkButton: View {
  let systemName: String
  let title: String
  let palette: NativeSignInPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        Image(systemName: systemName)
          .font(.system(size: 21, weight: .medium))
        Text(title)
          .font(.system(size: 16, weight: .regular))
      }
      .foregroundStyle(palette.accent)
      .frame(maxWidth: .infinity)
      .frame(height: 34)
    }
    .buttonStyle(.plain)
  }
}

private struct AffineLogoMark: View {
  var body: some View {
    ZStack {
      Triangle()
        .stroke(Color.black, lineWidth: 1.3)
        .rotationEffect(.degrees(-14))
      ForEach(0..<5, id: \.self) { index in
        Triangle()
          .stroke(Color.black.opacity(0.95), lineWidth: 0.9)
          .scaleEffect(0.18 + CGFloat(index) * 0.14)
          .rotationEffect(.degrees(-14))
      }
    }
  }
}

private struct Triangle: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.midX, y: rect.minY + 2))
    path.addLine(to: CGPoint(x: rect.maxX - 2, y: rect.maxY - 2))
    path.addLine(to: CGPoint(x: rect.minX + 2, y: rect.maxY - 2))
    path.closeSubpath()
    return path
  }
}

private struct NativeSignInDottedBackground: View {
  var body: some View {
    Canvas { context, size in
      let spacing: CGFloat = 13
      let dot = Path(ellipseIn: CGRect(x: 0, y: 0, width: 3, height: 3))
      for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
        for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
          context.fill(
            dot.applying(CGAffineTransform(translationX: x, y: y)),
            with: .color(Color.black.opacity(0.11))
          )
        }
      }
    }
    .background(Color(red: 0.95, green: 0.95, blue: 0.95))
  }
}

private enum DecorativeShapeKind {
  case plane
  case cloud
  case shield
}

private struct DecorativeShape: View {
  let kind: DecorativeShapeKind

  var body: some View {
    ZStack {
      shape
        .fill(
          LinearGradient(
            colors: [Color.white, Color(red: 0.89, green: 0.89, blue: 0.89)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .shadow(color: .black.opacity(0.10), radius: 10, x: 0, y: 6)
      shape
        .stroke(Color.white.opacity(0.92), lineWidth: 1.5)
    }
  }

  private var shape: AnyNativeSignInShape {
    switch kind {
    case .plane:
      AnyNativeSignInShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    case .cloud:
      AnyNativeSignInShape(CloudShape())
    case .shield:
      AnyNativeSignInShape(ShieldShape())
    }
  }
}

private struct AnyNativeSignInShape: Shape {
  private let makePath: (CGRect) -> Path

  init<S: Shape>(_ shape: S) {
    makePath = { rect in
      shape.path(in: rect)
    }
  }

  func path(in rect: CGRect) -> Path {
    makePath(rect)
  }
}

private struct CloudShape: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let w = rect.width
    let h = rect.height
    path.move(to: CGPoint(x: 0.16 * w, y: 0.70 * h))
    path.addCurve(to: CGPoint(x: 0.35 * w, y: 0.36 * h), control1: CGPoint(x: 0.10 * w, y: 0.52 * h), control2: CGPoint(x: 0.20 * w, y: 0.36 * h))
    path.addCurve(to: CGPoint(x: 0.52 * w, y: 0.18 * h), control1: CGPoint(x: 0.38 * w, y: 0.24 * h), control2: CGPoint(x: 0.45 * w, y: 0.18 * h))
    path.addCurve(to: CGPoint(x: 0.73 * w, y: 0.43 * h), control1: CGPoint(x: 0.65 * w, y: 0.18 * h), control2: CGPoint(x: 0.73 * w, y: 0.30 * h))
    path.addCurve(to: CGPoint(x: 0.88 * w, y: 0.70 * h), control1: CGPoint(x: 0.83 * w, y: 0.45 * h), control2: CGPoint(x: 0.92 * w, y: 0.55 * h))
    path.addCurve(to: CGPoint(x: 0.70 * w, y: 0.88 * h), control1: CGPoint(x: 0.86 * w, y: 0.82 * h), control2: CGPoint(x: 0.78 * w, y: 0.88 * h))
    path.addLine(to: CGPoint(x: 0.18 * w, y: 0.88 * h))
    path.addCurve(to: CGPoint(x: 0.16 * w, y: 0.70 * h), control1: CGPoint(x: 0.08 * w, y: 0.88 * h), control2: CGPoint(x: 0.02 * w, y: 0.78 * h))
    path.closeSubpath()
    return path
  }
}

private struct ShieldShape: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let w = rect.width
    let h = rect.height
    path.move(to: CGPoint(x: 0.50 * w, y: 0.04 * h))
    path.addCurve(to: CGPoint(x: 0.90 * w, y: 0.22 * h), control1: CGPoint(x: 0.62 * w, y: 0.10 * h), control2: CGPoint(x: 0.76 * w, y: 0.17 * h))
    path.addCurve(to: CGPoint(x: 0.52 * w, y: 0.96 * h), control1: CGPoint(x: 0.92 * w, y: 0.58 * h), control2: CGPoint(x: 0.75 * w, y: 0.82 * h))
    path.addCurve(to: CGPoint(x: 0.10 * w, y: 0.22 * h), control1: CGPoint(x: 0.27 * w, y: 0.82 * h), control2: CGPoint(x: 0.08 * w, y: 0.58 * h))
    path.addCurve(to: CGPoint(x: 0.50 * w, y: 0.04 * h), control1: CGPoint(x: 0.25 * w, y: 0.17 * h), control2: CGPoint(x: 0.38 * w, y: 0.10 * h))
    path.closeSubpath()
    return path
  }
}

