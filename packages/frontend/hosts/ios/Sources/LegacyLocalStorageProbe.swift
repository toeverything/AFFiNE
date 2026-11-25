import Foundation
import WebKit

/// Positive sentinel payload captured from the legacy Capacitor origin.
struct LegacyLocalStorageSnapshot: Codable, Equatable {
  let origin: String
  let length: Int
  let keys: [String]
  let entries: [String: String]
}

enum LegacyLocalStorageProbeError: Error, Equatable {
  case alreadyInProgress
  case invalidOrigin(String)
  case invalidPayload
  case webViewFailure(String)
  case webContentProcessTerminated
}

private final class LegacyCapacitorSchemeHandler: NSObject, WKURLSchemeHandler {
  private static let emptyHtml = Data("<!doctype html><html><body></body></html>".utf8)

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(LegacyLocalStorageProbeError.invalidOrigin("missing"))
      return
    }
    if let response = HTTPURLResponse(
      url: url,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "text/html; charset=utf-8"]
    ) {
      urlSchemeTask.didReceive(response)
      urlSchemeTask.didReceive(Self.emptyHtml)
      urlSchemeTask.didFinish()
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

/// One-shot migration sentinel that reads whitelisted `localStorage` keys from
/// the legacy `capacitor://localhost` origin with zero IndexedDB access.
@MainActor
final class LegacyLocalStorageProbe: NSObject, WKNavigationDelegate {
  static let legacyOrigin = "capacitor://localhost"
  static let probeURLString = "capacitor://localhost/__affine_probe__"

  private var webView: WKWebView?
  private var allowedKeys: [String] = []
  private var continuation: CheckedContinuation<LegacyLocalStorageSnapshot, Error>?
  private var activeRunId: UInt64 = 0

  func capture(allowedKeys: [String]) async throws -> LegacyLocalStorageSnapshot {
    guard continuation == nil else {
      throw LegacyLocalStorageProbeError.alreadyInProgress
    }
    activeRunId &+= 1
    let currentRunId = activeRunId
    self.allowedKeys = allowedKeys

    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.setURLSchemeHandler(LegacyCapacitorSchemeHandler(), forURLScheme: "capacitor")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    self.webView = webView

    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      guard let probeURL = URL(string: Self.probeURLString) else {
        self.finish(
          runId: currentRunId,
          result: .failure(LegacyLocalStorageProbeError.invalidOrigin(Self.legacyOrigin))
        )
        return
      }
      webView.load(URLRequest(url: probeURL))
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    let runId = activeRunId
    let encodedAllowlist: String
    if let data = try? JSONEncoder().encode(allowedKeys),
      let json = String(data: data, encoding: .utf8)
    {
      encodedAllowlist = json
    } else {
      encodedAllowlist = "[]"
    }

    // Synchronous window.localStorage read only. Zero IndexedDB access.
    let script = """
      (() => {
        const allow = new Set(\(encodedAllowlist));
        const keys = [];
        const entries = {};
        const total = window.localStorage.length;
        for (let i = 0; i < total; i += 1) {
          const k = window.localStorage.key(i);
          if (k !== null && allow.has(k)) {
            keys.push(k);
            const v = window.localStorage.getItem(k);
            if (v !== null) {
              entries[k] = v;
            }
          }
        }
        keys.sort();
        return JSON.stringify({
          origin: window.location.origin,
          length: total,
          keys,
          entries
        });
      })()
      """

    webView.evaluateJavaScript(script) { [weak self] result, error in
      guard let self else {
        return
      }
      if let error {
        self.finish(
          runId: runId,
          result: .failure(LegacyLocalStorageProbeError.webViewFailure(error.localizedDescription))
        )
        return
      }
      guard
        let jsonString = result as? String,
        let data = jsonString.data(using: .utf8),
        let snapshot = try? JSONDecoder().decode(LegacyLocalStorageSnapshot.self, from: data)
      else {
        self.finish(runId: runId, result: .failure(LegacyLocalStorageProbeError.invalidPayload))
        return
      }
      guard snapshot.origin == Self.legacyOrigin else {
        self.finish(
          runId: runId,
          result: .failure(LegacyLocalStorageProbeError.invalidOrigin(snapshot.origin))
        )
        return
      }
      self.finish(runId: runId, result: .success(snapshot))
    }
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(
      runId: activeRunId,
      result: .failure(LegacyLocalStorageProbeError.webViewFailure(error.localizedDescription))
    )
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(
      runId: activeRunId,
      result: .failure(LegacyLocalStorageProbeError.webViewFailure(error.localizedDescription))
    )
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    finish(runId: activeRunId, result: .failure(LegacyLocalStorageProbeError.webContentProcessTerminated))
  }

  private func finish(runId: UInt64, result: Result<LegacyLocalStorageSnapshot, Error>) {
    guard runId == activeRunId, let activeContinuation = continuation else {
      return
    }
    continuation = nil
    webView?.navigationDelegate = nil
    webView = nil
    activeContinuation.resume(with: result)
  }
}
