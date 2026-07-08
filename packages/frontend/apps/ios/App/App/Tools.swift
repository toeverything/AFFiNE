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
  static func ensureSignedIn(using webView: WKWebView, dismissing controller: UIViewController? = nil) async -> Bool {
    if await currentUserIdentifier(in: webView) != nil {
      return true
    }

    await dismissIfNeeded(controller)

    do {
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
    } catch {
      return false
    }

    return await currentUserIdentifier(in: webView) != nil
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

    return subscriptionState["pro"] as? [String: Any] != nil
  }

  private static func dismissIfNeeded(_ controller: UIViewController?) async {
    guard let controller, controller.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      controller.dismiss(animated: true) {
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
