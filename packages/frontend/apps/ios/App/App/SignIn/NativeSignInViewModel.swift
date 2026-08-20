import SwiftUI

@MainActor
final class NativeSignInViewModel: ObservableObject {
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
  private var actionTask: Task<Void, Never>?
  private var appearanceTask: Task<Void, Never>?
  private var emailMethods: NativeSignInWebBridge.EmailMethods?

  init(bridge: NativeSignInWebBridge) {
    self.bridge = bridge
    appearance = NativeSignInAppearanceSnapshot(cachedSystemInterfaceStyle: UITraitCollection.current.userInterfaceStyle)
  }

  func loadAppearance() {
    appearanceTask?.cancel()
    appearanceTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        appearance = try await bridge.getAppearanceSnapshot()
        try Task.checkCancellation()
      } catch {
        guard !Task.isCancelled else { return }
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

  var canUseMagicLink: Bool {
    emailMethods?.canUseMagicLink == true
  }

  func close() {
    actionTask?.cancel()
    appearanceTask?.cancel()
    bridge.cancel()
    finishLoading()
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
    let status: String = switch provider {
    case .google: String(localized: "Waiting for Google sign-in...")
    case .apple: String(localized: "Waiting for Apple sign-in...")
    }
    beginLoading(loadingAction(for: provider), status: status)

    runAction { [weak self] in
      guard let self else { return }
      try await bridge.startOAuth(provider: provider)
      try Task.checkCancellation()
      statusMessage = String(localized: "Finishing sign-in...")
      if try await bridge.waitForAuthenticated() != nil {
        try await showSuccessAndFinish()
      } else {
        showError(String(localized: "Unable to sign in. Please try again."))
      }
    }
  }

  func continueWithEmail() {
    guard !isLoading else { return }
    email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canContinueWithEmail else {
      showError(String(localized: "Enter a valid email address."))
      return
    }

    beginLoading(.email, status: String(localized: "Checking sign-in method..."))

    runAction { [weak self] in
      guard let self else { return }
      let methods = try await bridge.checkEmailMethods(email: email)
      try Task.checkCancellation()
      emailMethods = methods
      if methods.hasPassword {
        step = .password
        statusMessage = nil
      } else if methods.canUseMagicLink {
        try await bridge.sendMagicLink(email: email)
        try Task.checkCancellation()
        magicCode = ""
        step = .magicCode
        statusMessage = String(format: NSLocalizedString("We sent a sign-in code to %@.", comment: ""), email)
      } else {
        showError(String(localized: "This email is not available for sign-in."))
      }
    }
  }

  func signInWithPassword() {
    guard !isLoading else { return }
    guard canContinueWithPassword else {
      showError(String(localized: "Enter your password."))
      return
    }

    beginLoading(.password, status: String(localized: "Signing in..."))

    runAction { [weak self] in
      guard let self else { return }
      _ = try await bridge.signInWithPassword(email: email, password: password)
      try await showSuccessAndFinish()
    }
  }

  func signInWithMagicCode() {
    guard !isLoading else { return }
    guard canContinueWithCode else {
      showError(String(localized: "Enter the 6-digit sign-in code."))
      return
    }

    beginLoading(.magicCode, status: String(localized: "Verifying sign-in code..."))

    runAction { [weak self] in
      guard let self else { return }
      _ = try await bridge.signInWithMagicLink(email: email, token: magicCode)
      try await showSuccessAndFinish()
    }
  }

  func resendMagicCode() {
    guard !isLoading, canUseMagicLink else { return }
    beginLoading(.resendCode, status: String(localized: "Sending a new code..."))

    runAction { [weak self] in
      guard let self else { return }
      try await bridge.sendMagicLink(email: email)
      try Task.checkCancellation()
      statusMessage = String(format: NSLocalizedString("We sent a new sign-in code to %@.", comment: ""), email)
    }
  }

  func useMagicLink() {
    guard canUseMagicLink else { return }
    step = .magicCode
    resendMagicCode()
  }

  func openSelfHosted() {
    guard !isLoading else { return }
    beginLoading(.selfHosted, status: String(localized: "Opening self-hosted sign-in..."))

    runAction { [weak self] in
      guard let self else { return }
      try await bridge.openSelfHostedSignIn()
      try Task.checkCancellation()
      onFinished?(false)
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
    actionTask?.cancel()
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

  private func runAction(_ operation: @escaping @MainActor () async throws -> Void) {
    actionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        try await operation()
        try Task.checkCancellation()
      } catch is CancellationError {
        return
      } catch {
        showError(error)
      }
      finishLoading()
    }
  }

  private func showError(_ error: Error) {
    showError(error.localizedDescription)
  }

  private func showError(_ message: String) {
    errorMessage = message
    statusMessage = nil
    isSuccessFeedback = false
  }

  private func showSuccessAndFinish() async throws {
    finishLoading()
    errorMessage = nil
    isSuccessFeedback = true
    statusMessage = String(localized: "Sign in Success")
    try await Task.sleep(nanoseconds: 1_150_000_000)
    try Task.checkCancellation()
    onFinished?(true)
  }

  private func isValidEmail(_ value: String) -> Bool {
    let pattern = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
    return value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
  }
}
