import Capacitor
import Foundation

public class AuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "AuthPlugin"
  public let jsName = "Auth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signInMagicLink", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInOauth", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInPassword", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
  ]

  @objc public func signInMagicLink(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")
        let email = try call.getStringEnsure("email")
        let token = try call.getStringEnsure("token")
        let clientNonce = call.getString("clientNonce")

        let (data, response) = try await self.fetch(endpoint, method: "POST", action: "/api/auth/magic-link", headers: [:], body: ["email": email, "token": token, "client_nonce": clientNonce])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
        }

        guard let token = try self.tokenFromCookie(endpoint) else {
          call.reject("token not found")
          return
        }

        call.resolve(["token": token])
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

        let (data, response) = try await self.fetch(endpoint, method: "POST", action: "/api/oauth/callback", headers: [:], body: ["code": code, "state": state, "client_nonce": clientNonce])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
        }

        guard let token = try self.tokenFromCookie(endpoint) else {
          call.reject("token not found")
          return
        }

        call.resolve(["token": token])
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

        let (data, response) = try await self.fetch(endpoint, method: "POST", action: "/api/auth/sign-in", headers: [
          "x-captcha-token": verifyToken,
          "x-captcha-challenge": challenge,
        ], body: ["email": email, "password": password])

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
        }

        guard let token = try self.tokenFromCookie(endpoint) else {
          call.reject("token not found")
          return
        }

        call.resolve(["token": token])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  @objc public func signOut(_ call: CAPPluginCall) {
    Task {
      do {
        let endpoint = try call.getStringEnsure("endpoint")

        let (data, response) = try await self.fetch(endpoint, method: "GET", action: "/api/auth/sign-out", headers: [:], body: nil)

        if response.statusCode >= 400 {
          if let textBody = String(data: data, encoding: .utf8) {
            call.reject(textBody)
          } else {
            call.reject("Failed to sign in")
          }
        }

        call.resolve(["ok": true])
      } catch {
        call.reject("Failed to sign in, \(error)", nil, error)
      }
    }
  }

  private func tokenFromCookie(_ endpoint: String) throws -> String? {
    guard let endpointUrl = URL(string: endpoint) else {
      throw AuthError.invalidEndpoint
    }

    if let cookie = HTTPCookieStorage.shared.cookies(for: endpointUrl)?.first(where: {
      $0.name == "affine_session"
    }) {
      return cookie.value
    } else {
      return nil
    }
  }

  private func fetch(_ endpoint: String, method: String, action: String, headers: [String: String?], body: Encodable?) async throws -> (Data, HTTPURLResponse) {
    guard let targetUrl = URL(string: "\(endpoint)\(action)") else {
      throw AuthError.invalidEndpoint
    }

    var request = URLRequest(url: targetUrl)
    request.httpMethod = method
    request.httpShouldHandleCookies = true
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    if body != nil {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONEncoder().encode(body!)
    }
    request.setValue(AppConfigManager.getAffineVersion(), forHTTPHeaderField: "x-affine-version")
    request.timeoutInterval = 10 // time out 10s

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw AuthError.internalError
    }
    return (data, httpResponse)
  }
}

enum AuthError: Error {
  case invalidEndpoint, internalError
}
