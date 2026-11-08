import AuthenticationServices
import SwiftUI
import UIKit
import WebKit

enum NativeOAuthProvider: String {
  case google = "Google"
  case apple = "Apple"
}

final class NativeSignInPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }
}

@MainActor
final class NativeSignInWebBridge {
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

  func cancel() {
    authenticationSession?.cancel()
    authenticationSession = nil
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
      try Task.checkCancellation()
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
      "return await window.getCurrentUserIdentifier?.();",
      arguments: [:]
    )
    return userIdentifier(from: result)
  }

  private func call(_ script: String, arguments: [String: Any]) async throws -> Any? {
    try Task.checkCancellation()
    guard let webView else {
      throw signInError("AFFiNE is still loading. Please try again in a moment.")
    }

    let result = try await webView.callAsyncJavaScript(
      script,
      arguments: arguments,
      contentWorld: .page
    )
    try Task.checkCancellation()
    return result
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
      userInfo: [NSLocalizedDescriptionKey: NSLocalizedString(message, comment: "")]
    )
  }
}
