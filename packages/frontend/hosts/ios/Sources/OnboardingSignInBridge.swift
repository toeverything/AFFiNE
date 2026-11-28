import AuthenticationServices
import Foundation
import UIKit

/// Zero-CocoaPods Onboarding + Native Sign-In (`ASAuthorizationController` / OAuth callback)
/// narrow bridge integrated with `HostBootstrapCoordinator`.
@MainActor
final class OnboardingSignInBridge: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private weak var anchorWindow: UIWindow?
  private var hostHandle: OpaquePointer?
  private var onCompletion: ((Bool) -> Void)?

  func attach(window: UIWindow?, host: OpaquePointer) {
    anchorWindow = window
    hostHandle = host
  }

  func detach() {
    hostHandle = nil
    anchorWindow = nil
    onCompletion = nil
  }

  /// Starts native Sign in with Apple (`ASAuthorizationAppleIDProvider`).
  func beginAppleSignIn(completion: @escaping (Bool) -> Void) {
    onCompletion = completion
    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    request.requestedScopes = [.fullName, .email]
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  /// Begins OAuth flow with CSRF state registered in Rust.
  func beginOAuth(host: OpaquePointer, csrfState: String) -> Bool {
    csrfState.withCString { affine_ios_island_onboarding_begin_oauth(host, $0) }
  }

  /// Handles `affine://auth/callback?code=...&state=...` deep link and verifies CSRF state in Rust.
  func handleOAuthCallbackUrl(_ url: URL, host: OpaquePointer) -> Bool {
    guard
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let items = components.queryItems,
      let code = items.first(where: { $0.name == "code" })?.value,
      let state = items.first(where: { $0.name == "state" })?.value
    else {
      return false
    }
    return code.withCString { cCode in
      state.withCString { cState in
        affine_ios_island_onboarding_complete_oauth(host, cCode, cState)
      }
    }
  }

  /// Deterministic Apple credential completion entry point (also called by `ASAuthorizationControllerDelegate`).
  func completeAppleCredential(
    host: OpaquePointer,
    userIdentifier: String,
    identityTokenJws: String
  ) -> Bool {
    userIdentifier.withCString { cUid in
      identityTokenJws.withCString { cJws in
        affine_ios_island_onboarding_complete_apple(host, cUid, cJws)
      }
    }
  }

  func stateJson(host: OpaquePointer) -> String {
    guard let ptr = affine_ios_island_onboarding_state_json(host) else {
      return "{}"
    }
    defer { affine_ios_string_free(ptr) }
    return String(cString: ptr)
  }

  nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      anchorWindow ?? UIWindow()
    }
  }

  nonisolated func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    Task { @MainActor [weak self] in
      guard
        let self,
        let host = self.hostHandle,
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
        let tokenData = credential.identityToken,
        let jws = String(data: tokenData, encoding: .utf8)
      else {
        self?.onCompletion?(false)
        self?.onCompletion = nil
        return
      }
      let ok = self.completeAppleCredential(
        host: host,
        userIdentifier: credential.user,
        identityTokenJws: jws
      )
      self.onCompletion?(ok)
      self.onCompletion = nil
    }
  }

  nonisolated func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    Task { @MainActor [weak self] in
      self?.onCompletion?(false)
      self?.onCompletion = nil
    }
  }
}
