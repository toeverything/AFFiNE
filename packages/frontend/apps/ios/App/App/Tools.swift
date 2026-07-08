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

    return await waitForCurrentUserIdentifier(in: webView, timeout: 300)
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

  private static func dismissIfNeeded(_ controller: UIViewController?) async {
    guard let controller, controller.presentingViewController != nil else { return }
    await withCheckedContinuation { continuation in
      controller.dismiss(animated: true) {
        continuation.resume()
      }
    }
  }

  private static func waitForCurrentUserIdentifier(in webView: WKWebView, timeout: TimeInterval) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if await currentUserIdentifier(in: webView) != nil {
        return true
      }
      try? await Task.sleep(nanoseconds: 750_000_000)
    }
    return false
  }

  private static func userIdentifier(from result: Any?) -> String? {
    guard let rawIdentifier = result as? String else { return nil }
    let identifier = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
    return identifier.isEmpty ? nil : identifier
  }
}
