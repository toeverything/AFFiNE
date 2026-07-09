//
//  Tools.swift
//  AFFiNE
//
//  Created by qaq on 9/18/25.
//

import Foundation
import UIKit
import WebKit

extension Optional {
  func get(_ failure: String? = nil) throws -> Wrapped {
    guard let self else {
      if let failure {
        throw NSError(domain: #function, code: -1, userInfo: [NSLocalizedDescriptionKey: failure])
      } else {
        throw NSError(domain: #function, code: -1)
      }
    }
    return self
  }
}

@MainActor
enum PaywallAuthGuard {
  private static let bridgeReadyTimeout: TimeInterval = 10
  private static let signInFlowTimeout: TimeInterval = 5 * 60 + 5
  private static let bridgePollIntervalNanoseconds: UInt64 = 200_000_000

  static func ensureSignedIn(
    using webView: WKWebView,
    dismissing controller: UIViewController? = nil,
    onSignInFlowPresented: (() -> Void)? = nil
  ) async throws -> Bool {
    try await waitForBridgeFunctions(["getCurrentUserIdentifier", "requestSignIn"], in: webView)

    if await currentUserIdentifier(in: webView) != nil {
      return true
    }

    await dismissIfNeeded(controller)
    onSignInFlowPresented?()

    let result = try await webView.callAsyncJavaScript(
      "return await window.requestSignIn();",
      contentWorld: .page
    )
    if result == nil || result is NSNull {
      return false
    }
    if userIdentifier(from: result) != nil {
      return true
    }

    return await currentUserIdentifier(in: webView) != nil
  }

  static func ensureSignedInWithRoute(
    using webView: WKWebView,
    dismissing controller: UIViewController? = nil,
    onSignInFlowPresented: (() -> Void)? = nil,
    isCancelled: @escaping () -> Bool = { false }
  ) async throws -> Bool {
    try await waitForBridgeFunctions(["getCurrentUserIdentifier"], in: webView)

    if await currentUserIdentifier(in: webView) != nil {
      await dismissIfNeeded(controller)
      return true
    }

    await dismissIfNeeded(controller)

    _ = try await webView.callAsyncJavaScript(
      "window.location.assign('/sign-in'); return true;",
      contentWorld: .page
    )
    onSignInFlowPresented?()

    return try await waitForRouteSignInResolution(in: webView, isCancelled: isCancelled)
  }

  static func currentUserIdentifier(in webView: WKWebView) async -> String? {
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

  static func hasProSubscription(in webView: WKWebView) async throws -> Bool {
    let subscriptionState = try await fetchSubscriptionState(in: webView)
    return subscriptionState["pro"] as? [String: Any] != nil
  }

  static func hasAISubscription(in webView: WKWebView) async throws -> Bool {
    let subscriptionState = try await fetchSubscriptionState(in: webView)
    return hasActiveSubscription(subscriptionState["ai"])
  }

  private static func hasActiveSubscription(_ value: Any?) -> Bool {
    guard let subscription = value as? [String: Any] else { return false }
    let status = (subscription["status"] as? String)?.lowercased()
    return status == "active" || status == "trialing"
  }

  private static func fetchSubscriptionState(in webView: WKWebView) async throws -> [String: Any] {
    try await waitForBridgeFunctions(["getSubscriptionState"], in: webView)

    let result = try await webView.callAsyncJavaScript(
      "return await window.getSubscriptionState();",
      contentWorld: .page
    )

    guard let subscriptionState = result as? [String: Any] else {
      throw NSError(
        domain: "PaywallAuthGuard",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Unable to determine subscription status."]
      )
    }

    return subscriptionState
  }

  private static func waitForBridgeFunctions(_ functionNames: [String], in webView: WKWebView) async throws {
    let deadline = Date().addingTimeInterval(bridgeReadyTimeout)

    while Date() < deadline {
      if await areBridgeFunctionsAvailable(functionNames, in: webView) {
        return
      }
      try await Task.sleep(nanoseconds: bridgePollIntervalNanoseconds)
    }

    throw NSError(
      domain: "PaywallAuthGuard",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: "AFFiNE is still loading. Please wait a moment and try again."]
    )
  }

  private static func waitForRouteSignInResolution(
    in webView: WKWebView,
    isCancelled: () -> Bool
  ) async throws -> Bool {
    let deadline = Date().addingTimeInterval(signInFlowTimeout)
    var didEnterSignInRoute = false

    while Date() < deadline {
      if isCancelled() {
        return false
      }

      if await currentUserIdentifier(in: webView) != nil {
        return true
      }

      if let pathname = await currentPathname(in: webView) {
        if pathname == "/sign-in" {
          didEnterSignInRoute = true
        } else if didEnterSignInRoute {
          return false
        }
      }

      try await Task.sleep(nanoseconds: bridgePollIntervalNanoseconds)
    }

    throw NSError(
      domain: "PaywallAuthGuard",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: "Sign-in timed out."]
    )
  }

  private static func currentPathname(in webView: WKWebView) async -> String? {
    do {
      let result = try await webView.callAsyncJavaScript(
        "return window.location.pathname;",
        contentWorld: .page
      )
      return result as? String
    } catch {
      return nil
    }
  }

  private static func areBridgeFunctionsAvailable(_ functionNames: [String], in webView: WKWebView) async -> Bool {
    let expression = functionNames
      .map { "typeof window.\($0) === 'function'" }
      .joined(separator: " && ")

    do {
      let result = try await webView.callAsyncJavaScript(
        "return \(expression);",
        contentWorld: .page
      )
      return result as? Bool == true
    } catch {
      return false
    }
  }

  private static func dismissIfNeeded(_ controller: UIViewController?) async {
    guard let controller, controller.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      controller.dismiss(animated: false) {
        continuation.resume()
      }
    }
  }

  private static func userIdentifier(from result: Any?) -> String? {
    guard let rawIdentifier = result as? String else { return nil }
    let identifier = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
    return identifier.isEmpty ? nil : identifier
  }
}
