//
//  QLService+URLSessionCookieClient.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/23/25.
//

import Apollo
import Foundation
import Security

extension QLService {
  final class URLSessionCookieClient: URLSessionClient {
    init() {
      super.init()
      session.configuration.httpCookieStorage = .init()
      HTTPCookieStorage.shared.cookies?.forEach { cookie in
        self.session.configuration.httpCookieStorage?.setCookie(cookie)
      }
    }

    // AFFiNE native auth is token-based: after sign-in the web layer stores a
    // Bearer token in the Keychain and clears the session cookies (see
    // AuthPlugin.exchangeSession). Every native GraphQL/REST call therefore has
    // to attach `Authorization: Bearer <token>` the same way the web `fetch`
    // shim does in `proxy.ts`; otherwise requests are anonymous and
    // `currentUser` resolves to nil. All Apollo traffic and the raw
    // `sendAuthenticatedRequest`/`put` helpers funnel through this method, so
    // injecting here covers them in one place.
    @discardableResult
    override func sendRequest(
      _ request: URLRequest,
      taskDescription: String?,
      rawTaskCompletionHandler: RawCompletion?,
      completion: @escaping Completion
    ) -> URLSessionTask {
      super.sendRequest(
        QLService.shared.authorized(request),
        taskDescription: taskDescription,
        rawTaskCompletionHandler: rawTaskCompletionHandler,
        completion: completion
      )
    }
  }
}

extension QLService {
  private static let authTokenService = "app.affine.pro.auth-token"

  /// Returns a copy of `request` with an `Authorization: Bearer` header when the
  /// request targets the current AFFiNE server and a Keychain token exists.
  /// External hosts (e.g. presigned blob-storage uploads) are left untouched.
  func authorized(_ request: URLRequest) -> URLRequest {
    guard request.value(forHTTPHeaderField: "Authorization") == nil,
          let requestURL = request.url,
          let requestOrigin = Self.canonicalOrigin(of: requestURL),
          let serverOrigin = Self.canonicalOrigin(of: serverBaseURL),
          requestOrigin == serverOrigin,
          let token = currentAuthToken()
    else {
      return request
    }
    var authorized = request
    authorized.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return authorized
  }

  /// Reads the Bearer token the web layer persisted for the current server,
  /// keyed by the canonical origin (matching `AuthPlugin.canonicalEndpoint` and
  /// the JS `readEndpointToken`).
  func currentAuthToken() -> String? {
    guard let account = Self.canonicalOrigin(of: serverBaseURL) else { return nil }

    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.authTokenService,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess,
          let data = item as? Data,
          let token = String(data: data, encoding: .utf8),
          !token.isEmpty
    else {
      return nil
    }
    return token
  }

  private static func canonicalOrigin(of url: URL) -> String? {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let scheme = components.scheme?.lowercased(),
          let host = components.host?.lowercased()
    else {
      return nil
    }
    let defaultPort = scheme == "https" ? 443 : (scheme == "http" ? 80 : nil)
    if let port = components.port, port != defaultPort {
      return "\(scheme)://\(host):\(port)"
    }
    return "\(scheme)://\(host)"
  }
}
