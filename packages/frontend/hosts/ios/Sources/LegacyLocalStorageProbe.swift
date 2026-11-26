import Foundation
import WebKit

/// Unified `WebViewStorageSentinel` payload captured from the legacy Capacitor origin.
struct LegacyLocalStorageSnapshot: Codable, Equatable {
  let origin: String
  let length: Int
  let keys: [String]
  let entries: [String: String]
  let idbAccessCount: Int
}

enum LegacyLocalStorageProbeError: Error, Equatable {
  case alreadyInProgress
  case invalidOrigin(String)
  case invalidPayload
  case indexedDbAccessForbidden(Int)
  case keyNotWhitelisted(String)
  case protectedKeyRemovalForbidden(String)
  case writeBackMismatch(String)
  case timedOut
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

/// One-shot migration sentinel and rollback writer for the legacy `capacitor://localhost`
/// origin with a hard runtime trap forbidding any IndexedDB access (`idbAccessCount == 0`).
@MainActor
final class LegacyLocalStorageProbe: NSObject, WKNavigationDelegate {
  static let legacyOrigin = "capacitor://localhost"
  static let probeURLString = "capacitor://localhost/__affine_probe__"
  static let localWorkspaceKey = "affine-local-workspace"

  /// Delegate allowlist membership directly to `affine-legacy-import` via Rust C-ABI.
  static func isWhitelistedKey(_ key: String) -> Bool {
    key.withCString { affine_ios_legacy_is_permitted_key($0) }
  }

  /// Validate write-back mutations before touching `capacitor://localhost` `localStorage`.
  static func validateWriteBackKeys(set: [String: String], remove: [String]) throws {
    for key in set.keys {
      guard isWhitelistedKey(key) else {
        throw LegacyLocalStorageProbeError.keyNotWhitelisted(key)
      }
    }
    for key in remove {
      guard isWhitelistedKey(key) else {
        throw LegacyLocalStorageProbeError.keyNotWhitelisted(key)
      }
      guard key != localWorkspaceKey else {
        throw LegacyLocalStorageProbeError.protectedKeyRemovalForbidden(key)
      }
    }
  }

  /// Document-start trap injected into every probe WKWebView to guarantee zero IDB access.
  private static let idbGuardUserScriptSource = """
    (() => {
      window.__affineIdbAccessCount = 0;
      const idb = window.indexedDB;
      if (!idb) {
        return;
      }
      const trap = (methodName) => function () {
        window.__affineIdbAccessCount += 1;
        throw new Error("IndexedDB." + methodName + " is forbidden during legacy localStorage probe");
      };
      try {
        Object.defineProperty(idb, "open", { value: trap("open"), configurable: true });
        Object.defineProperty(idb, "deleteDatabase", { value: trap("deleteDatabase"), configurable: true });
      } catch (_) {
        idb.open = trap("open");
        idb.deleteDatabase = trap("deleteDatabase");
      }
    })();
    """

  private enum Mode {
    case capture(allowedKeys: [String])
    case writeBack(set: [String: String], remove: [String])
  }

  private var webView: WKWebView?
  private var mode: Mode = .capture(allowedKeys: [])
  private var continuation: CheckedContinuation<LegacyLocalStorageSnapshot, Error>?
  private var timeoutTask: Task<Void, Never>?
  private var activeRunId: UInt64 = 0

  /// Capture the unified `WebViewStorageSentinel` from `capacitor://localhost`:
  /// `keys` holds all sorted `localStorage` keys (`keys.count == length`), while `entries`
  /// contains strictly whitelisted key-value pairs.
  func capture(
    allowedKeys: [String] = [],
    timeoutSeconds: TimeInterval = 5.0
  ) async throws -> LegacyLocalStorageSnapshot {
    try await run(mode: .capture(allowedKeys: allowedKeys), timeoutSeconds: timeoutSeconds)
  }

  /// Write whitelisted mutated state back to `capacitor://localhost` `localStorage` and
  /// verify readback synchronously under the same zero-IndexedDB runtime guard.
  func writeBackLegacyLocalStorage(
    set: [String: String],
    remove: [String],
    timeoutSeconds: TimeInterval = 5.0
  ) async throws -> LegacyLocalStorageSnapshot {
    try Self.validateWriteBackKeys(set: set, remove: remove)
    let snapshot = try await run(
      mode: .writeBack(set: set, remove: remove),
      timeoutSeconds: timeoutSeconds
    )
    for (key, expected) in set {
      guard snapshot.entries[key] == expected else {
        throw LegacyLocalStorageProbeError.writeBackMismatch(key)
      }
    }
    for key in remove {
      guard snapshot.entries[key] == nil else {
        throw LegacyLocalStorageProbeError.writeBackMismatch(key)
      }
    }
    return snapshot
  }

  private func run(
    mode: Mode,
    timeoutSeconds: TimeInterval
  ) async throws -> LegacyLocalStorageSnapshot {
    guard continuation == nil else {
      throw LegacyLocalStorageProbeError.alreadyInProgress
    }
    activeRunId &+= 1
    let currentRunId = activeRunId
    self.mode = mode

    let userContent = WKUserContentController()
    let idbGuard = WKUserScript(
      source: Self.idbGuardUserScriptSource,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    )
    userContent.addUserScript(idbGuard)

    let configuration = WKWebViewConfiguration()
    configuration.userContentController = userContent
    configuration.websiteDataStore = .default()
    configuration.setURLSchemeHandler(LegacyCapacitorSchemeHandler(), forURLScheme: "capacitor")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    self.webView = webView

    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      let clampedTimeout = max(0.1, timeoutSeconds)
      self.timeoutTask = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(clampedTimeout * 1_000_000_000))
        self?.finish(runId: currentRunId, result: .failure(LegacyLocalStorageProbeError.timedOut))
      }
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
    let script: String
    switch mode {
    case .capture(let allowedKeys):
      script = buildCaptureScript(allowedKeys: allowedKeys)
    case .writeBack(let setEntries, let removeKeys):
      script = buildWriteBackScript(setEntries: setEntries, removeKeys: removeKeys)
    }

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
      guard snapshot.idbAccessCount == 0 else {
        self.finish(
          runId: runId,
          result: .failure(
            LegacyLocalStorageProbeError.indexedDbAccessForbidden(snapshot.idbAccessCount)
          )
        )
        return
      }
      let filteredEntries: [String: String]
      switch self.mode {
      case .capture(let allowedKeys) where !allowedKeys.isEmpty:
        let allowSet = Set(allowedKeys)
        filteredEntries = snapshot.entries.filter { allowSet.contains($0.key) }
      default:
        filteredEntries = snapshot.entries.filter { Self.isWhitelistedKey($0.key) }
      }
      let filtered = LegacyLocalStorageSnapshot(
        origin: snapshot.origin,
        length: snapshot.length,
        keys: snapshot.keys,
        entries: filteredEntries,
        idbAccessCount: snapshot.idbAccessCount
      )
      self.finish(runId: runId, result: .success(filtered))
    }
  }

  private func buildCaptureScript(allowedKeys: [String]) -> String {
    _ = allowedKeys
    return """
      (() => {
        const keys = [];
        const entries = {};
        const total = window.localStorage.length;
        for (let i = 0; i < total; i += 1) {
          const k = window.localStorage.key(i);
          if (k !== null) {
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
          entries,
          idbAccessCount: Number(window.__affineIdbAccessCount || 0)
        });
      })()
      """
  }

  private func buildWriteBackScript(setEntries: [String: String], removeKeys: [String]) -> String {
    let encodedSet = encodeJson(setEntries, fallback: "{}")
    let encodedRemove = encodeJson(removeKeys, fallback: "[]")
    return """
      (() => {
        const toSet = \(encodedSet);
        const toRemove = \(encodedRemove);
        for (const k of toRemove) {
          if (k === "\(Self.localWorkspaceKey)") {
            throw new Error("Forbidden key in write-back remove: " + k);
          }
        }
        for (const [k, v] of Object.entries(toSet)) {
          window.localStorage.setItem(k, v);
        }
        for (const k of toRemove) {
          window.localStorage.removeItem(k);
        }
        const keys = [];
        const entries = {};
        const total = window.localStorage.length;
        for (let i = 0; i < total; i += 1) {
          const k = window.localStorage.key(i);
          if (k !== null) {
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
          entries,
          idbAccessCount: Number(window.__affineIdbAccessCount || 0)
        });
      })()
      """
  }

  private func encodeJson<T: Encodable>(_ value: T, fallback: String) -> String {
    guard
      let data = try? JSONEncoder().encode(value),
      let json = String(data: data, encoding: .utf8)
    else {
      return fallback
    }
    return json
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
    timeoutTask?.cancel()
    timeoutTask = nil
    webView?.stopLoading()
    webView?.configuration.userContentController.removeAllUserScripts()
    webView?.navigationDelegate = nil
    webView = nil
    activeContinuation.resume(with: result)
  }
}
