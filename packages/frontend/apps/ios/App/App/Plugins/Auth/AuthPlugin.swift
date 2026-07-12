import Capacitor
import Foundation
import Security
import UIKit

private struct AuthSessionInfo: Codable {
  let id: String
  let absoluteExpiresAt: String
}

private struct AuthTokenResponse: Codable {
  let tokenType: String
  let accessToken: String
  let expiresIn: Int
  let refreshToken: String
  let refreshExpiresAt: String
  let session: AuthSessionInfo
}

private struct StoredAuthTokenPair: Codable {
  let version: Int
  let tokenType: String
  let accessToken: String
  let accessExpiresAt: Date
  let refreshToken: String
  let refreshExpiresAt: String
  let session: AuthSessionInfo
}

private struct AuthErrorResponse: Decodable {
  let code: String?
}

private struct AuthServerError: Error {
  let code: String?
  let statusCode: Int

  var permanentlyInvalidatesSession: Bool {
    switch code {
    case "AUTH_SESSION_EXPIRED", "AUTH_SESSION_REVOKED", "REFRESH_TOKEN_INVALID",
      "REFRESH_TOKEN_REUSED", "UNSUPPORTED_CLIENT_VERSION", "ACCESS_TOKEN_INVALID":
      return true
    default:
      return false
    }
  }
}

private struct AuthOperationCancelled: Error {}

private struct AuthRefreshOperation {
  let id: UUID
  let task: Task<StoredAuthTokenPair, Error>
}

private actor AuthSessionBroker {
  private let tokenService = "app.affine.pro.auth-token"
  private var refreshTasks: [String: AuthRefreshOperation] = [:]
  private var mutationEpochs: [String: UInt] = [:]

  func store(_ endpoint: String, response: AuthTokenResponse) throws {
    invalidateRefresh(canonicalEndpoint(endpoint))
    try write(endpoint, tokenPair(response))
  }

  func validAccessToken(_ endpoint: String, minValidity: TimeInterval = 120) async throws -> String? {
    guard let pair = try read(endpoint) else { return nil }
    if pair.accessExpiresAt.timeIntervalSinceNow > minValidity {
      return pair.accessToken
    }
    return try await refresh(endpoint).accessToken
  }

  func refreshAccessToken(_ endpoint: String) async throws -> String {
    try await refresh(endpoint).accessToken
  }

  func signOut(_ endpoint: String) async throws {
    let key = canonicalEndpoint(endpoint)
    let pair = try read(endpoint)
    invalidateRefresh(key)
    try delete(endpoint)
    guard let pair else { return }
    _ = try await request(
      endpoint, action: "/api/auth/session/revoke",
      body: ["refreshToken": pair.refreshToken])
  }

  func clear(_ endpoint: String) throws {
    invalidateRefresh(canonicalEndpoint(endpoint))
    try delete(endpoint)
  }

  private func refresh(_ endpoint: String) async throws -> StoredAuthTokenPair {
    let key = canonicalEndpoint(endpoint)
    if let operation = refreshTasks[key] { return try await operation.task.value }
    guard let current = try read(endpoint) else { throw AuthError.tokenNotFound }
    let epoch = mutationEpochs[key, default: 0]
    let operationId = UUID()
    let task = Task {
      do {
        let data = try await self.request(
          endpoint, action: "/api/auth/session/refresh",
          body: ["refreshToken": current.refreshToken])
        let response = try JSONDecoder().decode(AuthTokenResponse.self, from: data)
        let pair = try self.tokenPair(response)
        guard !Task.isCancelled, self.mutationEpochs[key, default: 0] == epoch else {
          throw AuthOperationCancelled()
        }
        try self.write(endpoint, pair)
        return pair
      } catch let error as AuthServerError where error.permanentlyInvalidatesSession {
        if self.mutationEpochs[key, default: 0] == epoch {
          try? self.delete(endpoint)
        }
        throw error
      }
    }
    refreshTasks[key] = AuthRefreshOperation(id: operationId, task: task)
    defer {
      if refreshTasks[key]?.id == operationId {
        refreshTasks[key] = nil
      }
    }
    return try await task.value
  }

  private func invalidateRefresh(_ key: String) {
    mutationEpochs[key, default: 0] &+= 1
    refreshTasks[key]?.task.cancel()
    refreshTasks[key] = nil
  }

  private func tokenPair(_ response: AuthTokenResponse) throws -> StoredAuthTokenPair {
    guard response.tokenType == "Bearer", !response.accessToken.isEmpty,
      !response.refreshToken.isEmpty, (1...86_400).contains(response.expiresIn),
      parseAuthISO8601Date(response.refreshExpiresAt) != nil,
      parseAuthISO8601Date(response.session.absoluteExpiresAt) != nil
    else {
      throw AuthError.invalidTokenResponse
    }
    return StoredAuthTokenPair(
      version: 1,
      tokenType: response.tokenType,
      accessToken: response.accessToken,
      accessExpiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn)),
      refreshToken: response.refreshToken,
      refreshExpiresAt: response.refreshExpiresAt,
      session: response.session)
  }

  private func request(_ endpoint: String, action: String, body: [String: String]) async throws -> Data {
    guard let url = URL(string: "\(canonicalEndpoint(endpoint))\(action)") else {
      throw AuthError.invalidEndpoint
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("native", forHTTPHeaderField: "x-affine-client-kind")
    request.setValue(AppConfigManager.getAffineVersion(), forHTTPHeaderField: "x-affine-version")
    request.httpBody = try JSONEncoder().encode(body)
    request.timeoutInterval = 10
    for attempt in 0..<3 {
      do {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else {
          throw AuthError.internalError
        }
        if response.statusCode < 400 { return data }
        let error = AuthServerError(
          code: try? JSONDecoder().decode(AuthErrorResponse.self, from: data).code,
          statusCode: response.statusCode)
        guard response.statusCode >= 500, attempt < 2 else { throw error }
      } catch let error as AuthServerError {
        if error.statusCode < 500 || attempt == 2 { throw error }
      } catch {
        if Task.isCancelled { throw AuthOperationCancelled() }
        if attempt == 2 { throw error }
      }
      let delay = UInt64((200 * (1 << attempt)) + Int.random(in: 0...150)) * 1_000_000
      try await Task.sleep(nanoseconds: delay)
    }
    throw AuthError.internalError
  }

  private func canonicalEndpoint(_ endpoint: String) -> String {
    guard let url = URL(string: endpoint), let scheme = url.scheme, let host = url.host else {
      return endpoint
    }
    let normalizedScheme = scheme.lowercased()
    let defaultPort = normalizedScheme == "http" ? 80 : normalizedScheme == "https" ? 443 : nil
    let port = url.port.flatMap { $0 == defaultPort ? nil : ":\($0)" } ?? ""
    return "\(normalizedScheme)://\(host.lowercased())\(port)"
  }

  private func query(_ endpoint: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: tokenService,
      kSecAttrAccount as String: canonicalEndpoint(endpoint),
    ]
  }

  private func read(_ endpoint: String) throws -> StoredAuthTokenPair? {
    var query = query(endpoint)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    if status == errSecInteractionNotAllowed || status == errSecNotAvailable {
      throw AuthError.credentialStoreUnavailable
    }
    guard status == errSecSuccess, let data = item as? Data else {
      throw AuthError.internalError
    }
    guard let pair = try? JSONDecoder().decode(StoredAuthTokenPair.self, from: data),
      pair.version == 1, pair.tokenType == "Bearer", !pair.accessToken.isEmpty,
      !pair.refreshToken.isEmpty, pair.accessExpiresAt.timeIntervalSince1970.isFinite,
      parseAuthISO8601Date(pair.refreshExpiresAt) != nil,
      parseAuthISO8601Date(pair.session.absoluteExpiresAt) != nil
    else {
      try delete(endpoint)
      return nil
    }
    return pair
  }

  private func write(_ endpoint: String, _ pair: StoredAuthTokenPair) throws {
    let data = try JSONEncoder().encode(pair)
    var add = query(endpoint)
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let update = [kSecValueData as String: data]
    let status = SecItemUpdate(query(endpoint) as CFDictionary, update as CFDictionary)
    if status == errSecItemNotFound {
      guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else {
        throw AuthError.internalError
      }
    } else if status != errSecSuccess {
      throw AuthError.internalError
    }
  }

  private func delete(_ endpoint: String) throws {
    let status = SecItemDelete(query(endpoint) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw AuthError.internalError
    }
  }
}

public class AuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "AuthPlugin"
  public let jsName = "Auth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signInMagicLink", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInOauth", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInOpenApp", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInPassword", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getValidAccessToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "refreshAccessToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearEndpointSession", returnType: CAPPluginReturnPromise),
  ]

  private let broker = AuthSessionBroker()
  private let authCookieNames = Set(["affine_session", "affine_user_id", "affine_csrf_token"])

  private func canonicalEndpoint(_ endpoint: String) -> String {
    guard let url = URL(string: endpoint), let scheme = url.scheme, let host = url.host else {
      return endpoint
    }

    let normalizedScheme = scheme.lowercased()
    let normalizedHost = host.lowercased()
    let defaultPort: Int?
    if normalizedScheme == "http" {
      defaultPort = 80
    } else if normalizedScheme == "https" {
      defaultPort = 443
    } else {
      defaultPort = nil
    }
    let port = url.port.flatMap { $0 == defaultPort ? nil : ":\($0)" } ?? ""
    return "\(normalizedScheme)://\(normalizedHost)\(port)"
  }

  @objc public func getValidAccessToken(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let token = try await broker.validAccessToken(endpoint)
        call.resolve(["token": token ?? NSNull()])
      } catch {
        call.reject("Failed to get access token, \(error)", nil, error)
      }
    }
  }

  @objc public func clearEndpointSession(_ call: CAPPluginCall) {
    Task {
      do {
        try await broker.clear(call.getStringEnsure("endpoint"))
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to clear auth session, \(error)", nil, error)
      }
    }
  }

  @objc public func refreshAccessToken(_ call: CAPPluginCall) {
    Task {
      do {
        let token = try await broker.refreshAccessToken(call.getStringEnsure("endpoint"))
        call.resolve(["token": token])
      } catch {
        call.reject("Failed to refresh access token, \(error)", nil, error)
      }
    }
  }

  @objc public func signInMagicLink(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let email = try call.getStringEnsure("email")
        let token = try call.getStringEnsure("token")
        let clientNonce = call.getString("clientNonce")

        let (data, response) = try await self.fetch(
          endpoint, method: "POST", action: "/api/auth/magic-link",
          headers: [
            "x-affine-client-kind": "native"
          ], body: ["email": email, "token": token, "client_nonce": clientNonce])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
          return
        }

        try await self.exchangeSession(endpoint, data)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signInOauth(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let code = try call.getStringEnsure("code")
        let state = try call.getStringEnsure("state")
        let clientNonce = call.getString("clientNonce")

        let (data, response) = try await self.fetch(
          endpoint, method: "POST", action: "/api/oauth/callback",
          headers: [
            "x-affine-client-kind": "native"
          ], body: ["code": code, "state": state, "client_nonce": clientNonce])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
          return
        }

        try await self.exchangeSession(endpoint, data)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signInPassword(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let email = try call.getStringEnsure("email")
        let password = try call.getStringEnsure("password")
        let verifyToken = call.getString("verifyToken")
        let challenge = call.getString("challenge")

        let (data, response) = try await self.fetch(
          endpoint, method: "POST", action: "/api/auth/sign-in",
          headers: [
            "x-affine-client-kind": "native",
            "x-captcha-token": verifyToken,
            "x-captcha-challenge": challenge,
            "x-captcha-provider": verifyToken == nil ? nil : (challenge == nil ? "turnstile" : "hashcash"),
          ], body: ["email": email, "password": password])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
          return
        }

        try await self.exchangeSession(endpoint, data)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signInOpenApp(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let code = try call.getStringEnsure("code")

        let (data, response) = try await self.fetch(
          endpoint, method: "POST", action: "/api/auth/open-app/sign-in",
          headers: [
            "x-affine-client-kind": "native"
          ], body: ["code": code])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
          return
        }

        try await self.exchangeSession(endpoint, data)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signOut(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        try await broker.signOut(endpoint)
        self.clearAuthCookies(endpoint)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign out, \(error)", nil, error)
      }
    }
  }

  private func exchangeCodeFromResponse(_ data: Data) throws -> String {
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let code = json["exchangeCode"] as? String
    else {
      throw AuthError.exchangeCodeNotFound
    }

    return code
  }

  private func exchangeSession(_ endpoint: String, _ signInData: Data) async throws {
    let code = try exchangeCodeFromResponse(signInData)
    let (data, response) = try await self.fetch(
      endpoint, method: "POST", action: "/api/auth/session/exchange",
      headers: [
        "x-affine-client-kind": "native"
      ], body: [
        "code": code,
        "installationId": self.installationId(),
        "platform": "ios",
        "deviceName": UIDevice.current.name,
      ])

    if response.statusCode >= 400 {
      throw AuthError.exchangeFailed
    }

    try await broker.store(endpoint, response: JSONDecoder().decode(AuthTokenResponse.self, from: data))
    self.clearAuthCookies(endpoint)
  }

  private func installationId() -> String {
    let key = "app.affine.pro.auth-installation-id"
    if let value = UserDefaults.standard.string(forKey: key) { return value }
    let value = UUID().uuidString
    UserDefaults.standard.set(value, forKey: key)
    return value
  }

  private func clearAuthCookies(_ endpoint: String) {
    guard let url = URL(string: endpoint), let host = url.host else {
      return
    }
    let normalizedHost = host.lowercased()

    HTTPCookieStorage.shared.cookies?.forEach { cookie in
      let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
      let domainMatches = normalizedHost == domain || normalizedHost.hasSuffix(".\(domain)")
      if domainMatches && authCookieNames.contains(cookie.name) {
        HTTPCookieStorage.shared.deleteCookie(cookie)
      }
    }
  }

  private func fetch(
    _ endpoint: String, method: String, action: String, headers: [String: String?], body: Encodable?
  ) async throws -> (Data, HTTPURLResponse) {
    guard let targetUrl = URL(string: "\(endpoint)\(action)") else {
      throw AuthError.invalidEndpoint
    }

    var request = URLRequest(url: targetUrl)
    request.httpMethod = method
    request.httpShouldHandleCookies = false
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    if body != nil {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONEncoder().encode(body!)
    }
    request.setValue(AppConfigManager.getAffineVersion(), forHTTPHeaderField: "x-affine-version")
    request.timeoutInterval = 10  // time out 10s

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw AuthError.internalError
    }
    return (data, httpResponse)
  }
}

enum AuthError: Error {
  case invalidEndpoint, internalError, credentialStoreUnavailable, tokenNotFound,
    exchangeCodeNotFound, exchangeFailed, invalidTokenResponse
}
