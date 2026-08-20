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

  private struct StoredAuthSessionInfo: Decodable {
    let id: String
    let absoluteExpiresAt: String
  }

  private struct StoredAuthTokenPair: Decodable {
    let version: Int
    let tokenType: String
    let accessToken: String
    let accessExpiresAt: Date
    let refreshToken: String
    let refreshExpiresAt: String
    let session: StoredAuthSessionInfo
  }

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
          let pair = try? JSONDecoder().decode(Self.StoredAuthTokenPair.self, from: data),
          pair.version == 1,
          pair.tokenType == "Bearer",
          !pair.accessToken.isEmpty,
          !pair.refreshToken.isEmpty,
          pair.accessExpiresAt > Date(),
          Self.parseAuthISO8601Date(pair.refreshExpiresAt) != nil,
          Self.parseAuthISO8601Date(pair.session.absoluteExpiresAt) != nil
    else {
      return nil
    }
    return pair.accessToken
  }

  private static func parseAuthISO8601Date(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
      return date
    }

    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
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
