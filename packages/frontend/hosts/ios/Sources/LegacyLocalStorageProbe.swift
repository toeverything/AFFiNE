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

  static let defaultExactKeys: [String] = [
    localWorkspaceKey,
    "global-state:serverList",
    "global-cache:i18n_lng",
    "last_workspace_id",
    "last_workspace_flavour",
    "affine-settings",
    "theme",
  ]

  static let defaultKeyPrefixes: [String] = [
    "global-state:serverConfig:",
    "affine-flag:",
    "global-state:affine-flag:",
  ]

  static func isWhitelistedKey(_ key: String) -> Bool {
    if defaultExactKeys.contains(key) {
      return true
    }
    for prefix in defaultKeyPrefixes {
      if key.hasPrefix(prefix) && key.count > prefix.count {
        return true
      }
    }
    if key.hasSuffix("-auth") {
      let stem = String(key.dropLast(5))
      let serverId = stem.hasPrefix("global-state:") ? String(stem.dropFirst(13)) : stem
      return !serverId.isEmpty
    }
    return false
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
      self.finish(runId: runId, result: .success(snapshot))
    }
  }

  private func buildWhitelistPredicateJs(explicitAllowJson: String) -> String {
    let encodedDefaultExact = encodeJson(Self.defaultExactKeys, fallback: "[]")
    let encodedDefaultPrefixes = encodeJson(Self.defaultKeyPrefixes, fallback: "[]")
    return """
      const explicitAllow = \(explicitAllowJson);
      const exactSet = new Set(explicitAllow.length > 0 ? explicitAllow : \(encodedDefaultExact));
      const prefixes = explicitAllow.length > 0 ? [] : \(encodedDefaultPrefixes);
      const allowAuthSuffix = explicitAllow.length === 0;
      const isAllowed = (k) => {
        if (exactSet.has(k)) return true;
        for (const p of prefixes) {
          if (k.startsWith(p) && k.length > p.length) return true;
        }
        if (allowAuthSuffix && k.endsWith("-auth")) {
          const prefix = k.slice(0, -5);
          const sid = prefix.startsWith("global-state:") ? prefix.slice(13) : prefix;
          if (sid.length > 0) return true;
        }
        return false;
      };
      """
  }

  private func buildCaptureScript(allowedKeys: [String]) -> String {
    let predicate = buildWhitelistPredicateJs(explicitAllowJson: encodeJson(allowedKeys, fallback: "[]"))
    return """
      (() => {
        \(predicate)
        const keys = [];
        const entries = {};
        const total = window.localStorage.length;
        for (let i = 0; i < total; i += 1) {
          const k = window.localStorage.key(i);
          if (k !== null) {
            keys.push(k);
            if (isAllowed(k)) {
              const v = window.localStorage.getItem(k);
              if (v !== null) {
                entries[k] = v;
              }
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
    let predicate = buildWhitelistPredicateJs(explicitAllowJson: "[]")
    let encodedSet = encodeJson(setEntries, fallback: "{}")
    let encodedRemove = encodeJson(removeKeys, fallback: "[]")
    return """
      (() => {
        \(predicate)
        const toSet = \(encodedSet);
        const toRemove = \(encodedRemove);
        for (const k of Object.keys(toSet)) {
          if (!isAllowed(k)) {
            throw new Error("Non-whitelisted key in write-back set: " + k);
          }
        }
        for (const k of toRemove) {
          if (!isAllowed(k) || k === "\(Self.localWorkspaceKey)") {
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
            if (isAllowed(k)) {
              const v = window.localStorage.getItem(k);
              if (v !== null) {
                entries[k] = v;
              }
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
