import Capacitor
import Foundation
import Security

public class AuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "AuthPlugin"
  public let jsName = "Auth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signInMagicLink", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInOauth", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInOpenApp", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInPassword", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readEndpointToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "writeEndpointToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteEndpointToken", returnType: CAPPluginReturnPromise),
  ]

  private let tokenService = "app.affine.pro.auth-token"
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

  @objc public func readEndpointToken(_ call: CAPPluginCall) {
    do {
      let endpoint = try call.getStringEnsure("endpoint")
      if let token = try self.readToken(endpoint) {
        call.resolve(["token": token])
      } else {
        call.resolve(["token": NSNull()])
      }
    } catch {
      call.reject("Failed to read endpoint token, \(error)", nil, error)
    }
  }

  @objc public func writeEndpointToken(_ call: CAPPluginCall) {
    do {
      let endpoint = try call.getStringEnsure("endpoint")
      let token = try call.getStringEnsure("token")
      try self.writeToken(endpoint, token)
      call.resolve(["ok": true])
    } catch {
      call.reject("Failed to write endpoint token, \(error)", nil, error)
    }
  }

  @objc public func deleteEndpointToken(_ call: CAPPluginCall) {
    do {
      let endpoint = try call.getStringEnsure("endpoint")
      try self.deleteToken(endpoint)
      call.resolve(["ok": true])
    } catch {
      call.reject("Failed to delete endpoint token, \(error)", nil, error)
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

        call.resolve(["token": try await self.exchangeSession(endpoint, data)])
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

        call.resolve(["token": try await self.exchangeSession(endpoint, data)])
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
          ], body: ["email": email, "password": password])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
          return
        }

        call.resolve(["token": try await self.exchangeSession(endpoint, data)])
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

        call.resolve(["token": try await self.exchangeSession(endpoint, data)])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signOut(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let token = call.getString("token")

        let (data, response) = try await self.fetch(
          endpoint, method: "POST", action: "/api/auth/sign-out",
          headers: [
            "Authorization": token.map { "Bearer \($0)" }
          ], body: nil)

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign out")
          }
          return
        }

        self.clearAuthCookies(endpoint)
        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign out, \(error)", nil, error)
      }
    }
  }

  private func tokenFromResponse(_ data: Data) throws -> String {
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let token = json["token"] as? String
    else {
      throw AuthError.tokenNotFound
    }

    return token
  }

  private func exchangeCodeFromResponse(_ data: Data) throws -> String {
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let code = json["exchangeCode"] as? String
    else {
      throw AuthError.exchangeCodeNotFound
    }

    return code
  }

  private func exchangeSession(_ endpoint: String, _ signInData: Data) async throws -> String {
    let code = try exchangeCodeFromResponse(signInData)
    let (data, response) = try await self.fetch(
      endpoint, method: "POST", action: "/api/auth/native/exchange",
      headers: [
        "x-affine-client-kind": "native"
      ], body: ["code": code])

    if response.statusCode >= 400 {
      throw AuthError.exchangeFailed
    }

    let token = try tokenFromResponse(data)
    self.clearAuthCookies(endpoint)
    return token
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

  private func tokenQuery(_ endpoint: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: tokenService,
      kSecAttrAccount as String: canonicalEndpoint(endpoint),
    ]
  }

  private func legacyTokenQuery(_ endpoint: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: tokenService,
      kSecAttrAccount as String: endpoint,
    ]
  }

  private func readToken(_ endpoint: String) throws -> String? {
    var query = tokenQuery(endpoint)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      guard canonicalEndpoint(endpoint) != endpoint else {
        return nil
      }

      var legacyQuery = legacyTokenQuery(endpoint)
      legacyQuery[kSecReturnData as String] = true
      legacyQuery[kSecMatchLimit as String] = kSecMatchLimitOne
      let legacyStatus = SecItemCopyMatching(legacyQuery as CFDictionary, &item)
      if legacyStatus == errSecItemNotFound {
        return nil
      }
      guard legacyStatus == errSecSuccess, let data = item as? Data else {
        throw AuthError.internalError
      }
      let token = String(data: data, encoding: .utf8)
      if let token = token {
        try writeToken(endpoint, token)
        let deleteStatus = SecItemDelete(legacyTokenQuery(endpoint) as CFDictionary)
        guard deleteStatus == errSecSuccess || deleteStatus == errSecItemNotFound else {
          throw AuthError.internalError
        }
      }
      return token
    }
    guard status == errSecSuccess, let data = item as? Data else {
      throw AuthError.internalError
    }
    return String(data: data, encoding: .utf8)
  }

  private func writeToken(_ endpoint: String, _ token: String) throws {
    try deleteToken(endpoint)
    var query = tokenQuery(endpoint)
    query[kSecValueData as String] = Data(token.utf8)
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw AuthError.internalError
    }
  }

  private func deleteToken(_ endpoint: String) throws {
    let status = SecItemDelete(tokenQuery(endpoint) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw AuthError.internalError
    }
    if canonicalEndpoint(endpoint) != endpoint {
      let legacyStatus = SecItemDelete(legacyTokenQuery(endpoint) as CFDictionary)
      guard legacyStatus == errSecSuccess || legacyStatus == errSecItemNotFound else {
        throw AuthError.internalError
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
  case invalidEndpoint, internalError, tokenNotFound, exchangeCodeNotFound, exchangeFailed
}
