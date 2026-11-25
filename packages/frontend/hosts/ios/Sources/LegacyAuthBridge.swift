import Foundation
import Security
import WebKit

/// Matches 0.27.5 `AuthPlugin.swift` `AuthSessionInfo`.
struct LegacyAuthSessionInfo: Codable, Equatable, Sendable {
  let id: String
  let absoluteExpiresAt: String
}

/// Matches 0.27.5 `AuthPlugin.swift` `StoredAuthTokenPair`.
///
/// Foundation's default `JSONEncoder`/`JSONDecoder` encodes `Date` as
/// `timeIntervalSinceReferenceDate` (2001-01-01T00:00:00Z `Double`), ensuring
/// zero-logout compatibility across upgrade, token rotation, and rollback.
struct LegacyStoredAuthTokenPair: Codable, Equatable, Sendable {
  let version: Int
  let tokenType: String
  let accessToken: String
  let accessExpiresAt: Date
  let refreshToken: String
  let refreshExpiresAt: String
  let session: LegacyAuthSessionInfo
}

enum LegacyAuthBridgeError: Error, Equatable, Sendable {
  case invalidEndpoint
  case invalidPayload
  case tokenNotFound
  case operationCancelled
  case credentialStoreUnavailable
  case keychainFailure(OSStatus)
  case httpFailure(statusCode: Int, permanentlyInvalidatesSession: Bool)
}

/// Persistence abstraction backing `LegacyAuthBridge` (defaults to iOS Keychain).
protocol LegacyAuthTokenPersistence: Sendable {
  func readRawData(service: String, account: String) throws -> Data?
  func writeRawData(_ data: Data, service: String, account: String) throws
  func deleteRawData(service: String, account: String) throws
}

/// Production Keychain persistence aligned with 0.27.5 `AuthPlugin.swift:215-269`.
struct KeychainAuthTokenPersistence: LegacyAuthTokenPersistence {
  private func baseQuery(service: String, account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  func readRawData(service: String, account: String) throws -> Data? {
    var query = baseQuery(service: service, account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      return nil
    }
    if status == errSecInteractionNotAllowed || status == errSecNotAvailable {
      throw LegacyAuthBridgeError.credentialStoreUnavailable
    }
    guard status == errSecSuccess, let data = item as? Data else {
      throw LegacyAuthBridgeError.keychainFailure(status)
    }
    return data
  }

  func writeRawData(_ data: Data, service: String, account: String) throws {
    var add = baseQuery(service: service, account: account)
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let update = [kSecValueData as String: data]
    let status = SecItemUpdate(baseQuery(service: service, account: account) as CFDictionary, update as CFDictionary)
    if status == errSecItemNotFound {
      let addStatus = SecItemAdd(add as CFDictionary, nil)
      guard addStatus == errSecSuccess else {
        throw LegacyAuthBridgeError.keychainFailure(addStatus)
      }
    } else if status != errSecSuccess {
      throw LegacyAuthBridgeError.keychainFailure(status)
    }
  }

  func deleteRawData(service: String, account: String) throws {
    let status = SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw LegacyAuthBridgeError.keychainFailure(status)
    }
  }
}

private struct AuthRefreshOperation {
  let id: UUID
  let task: Task<LegacyStoredAuthTokenPair, Error>
}

/// Actor-isolated single-flight session broker aligned with 0.27.5 `AuthPlugin.swift:70-150`.
private actor AuthSessionBroker {
  private let persistence: LegacyAuthTokenPersistence
  private let clientVersion: String
  private var refreshTasks: [String: AuthRefreshOperation] = [:]
  private var mutationEpochs: [String: UInt64] = [:]

  init(persistence: LegacyAuthTokenPersistence, clientVersion: String) {
    self.persistence = persistence
    self.clientVersion = clientVersion
  }

  func readTokenPair(for endpoint: String) throws -> LegacyStoredAuthTokenPair? {
    let account = LegacyAuthBridge.canonicalEndpoint(endpoint)
    guard let data = try persistence.readRawData(service: LegacyAuthBridge.keychainService, account: account) else {
      return nil
    }
    guard let json = String(data: data, encoding: .utf8) else {
      try persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: account)
      return nil
    }

    var isValid = false
    var expiresUnix = 0.0
    let normalizedPtr = json.withCString { cJson in
      affine_ios_auth_parse_keychain_json(
        cJson,
        Date().timeIntervalSince1970,
        120.0,
        &isValid,
        &expiresUnix
      )
    }
    guard let normalizedPtr else {
      try persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: account)
      return nil
    }
    defer { affine_ios_string_free(normalizedPtr) }
    let normalizedData = Data(String(cString: normalizedPtr).utf8)
    guard let pair = try? JSONDecoder().decode(LegacyStoredAuthTokenPair.self, from: normalizedData) else {
      try persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: account)
      return nil
    }
    return pair
  }

  func writeTokenPair(_ pair: LegacyStoredAuthTokenPair, for endpoint: String) throws {
    let key = LegacyAuthBridge.canonicalEndpoint(endpoint)
    invalidateRefresh(key)
    let data = try JSONEncoder().encode(pair)
    try persistence.writeRawData(data, service: LegacyAuthBridge.keychainService, account: key)
  }

  func storeServerTokenResponse(
    _ responseData: Data,
    for endpoint: String,
    nowUnixMs: Int64
  ) throws -> LegacyStoredAuthTokenPair {
    let key = LegacyAuthBridge.canonicalEndpoint(endpoint)
    invalidateRefresh(key)
    let (pair, payloadData) = try encodeTokenResponse(responseData, nowUnixMs: nowUnixMs)
    try persistence.writeRawData(payloadData, service: LegacyAuthBridge.keychainService, account: key)
    return pair
  }

  func deleteTokenPair(for endpoint: String) throws {
    let key = LegacyAuthBridge.canonicalEndpoint(endpoint)
    invalidateRefresh(key)
    try persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: key)
  }

  func validAccessToken(
    for endpoint: String,
    minValidity: TimeInterval,
    session: URLSession
  ) async throws -> LegacyStoredAuthTokenPair? {
    guard let pair = try readTokenPair(for: endpoint) else {
      return nil
    }
    if pair.accessExpiresAt.timeIntervalSinceNow > minValidity {
      return pair
    }
    return try await refreshSession(endpoint: endpoint, session: session)
  }

  func refreshSession(
    endpoint: String,
    session: URLSession
  ) async throws -> LegacyStoredAuthTokenPair {
    let key = LegacyAuthBridge.canonicalEndpoint(endpoint)
    if let existing = refreshTasks[key] {
      return try await existing.task.value
    }
    guard let current = try readTokenPair(for: endpoint) else {
      throw LegacyAuthBridgeError.tokenNotFound
    }
    let startEpoch = mutationEpochs[key, default: 0]
    let opId = UUID()
    let version = clientVersion
    let task = Task<LegacyStoredAuthTokenPair, Error> {
      do {
        let data = try await LegacyAuthBridge.postSessionAction(
          endpoint: endpoint,
          action: "/api/auth/session/refresh",
          body: ["refreshToken": current.refreshToken],
          clientVersion: version,
          session: session
        )
        return try self.commitRefreshedResponse(
          data,
          key: key,
          expectedEpoch: startEpoch,
          nowUnixMs: Int64(Date().timeIntervalSince1970 * 1000.0)
        )
      } catch let error as LegacyAuthBridgeError {
        if case .httpFailure(_, permanentlyInvalidatesSession: true) = error {
          self.deleteIfEpochMatches(key: key, expectedEpoch: startEpoch)
        }
        throw error
      }
    }
    refreshTasks[key] = AuthRefreshOperation(id: opId, task: task)
    defer {
      if refreshTasks[key]?.id == opId {
        refreshTasks[key] = nil
      }
    }
    return try await task.value
  }

  func prepareRevoke(endpoint: String) throws -> LegacyStoredAuthTokenPair? {
    let key = LegacyAuthBridge.canonicalEndpoint(endpoint)
    let current = try readTokenPair(for: endpoint)
    invalidateRefresh(key)
    try persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: key)
    return current
  }

  private func commitRefreshedResponse(
    _ responseData: Data,
    key: String,
    expectedEpoch: UInt64,
    nowUnixMs: Int64
  ) throws -> LegacyStoredAuthTokenPair {
    guard !Task.isCancelled, mutationEpochs[key, default: 0] == expectedEpoch else {
      throw LegacyAuthBridgeError.operationCancelled
    }
    let (pair, payloadData) = try encodeTokenResponse(responseData, nowUnixMs: nowUnixMs)
    guard !Task.isCancelled, mutationEpochs[key, default: 0] == expectedEpoch else {
      throw LegacyAuthBridgeError.operationCancelled
    }
    try persistence.writeRawData(payloadData, service: LegacyAuthBridge.keychainService, account: key)
    return pair
  }

  private func deleteIfEpochMatches(key: String, expectedEpoch: UInt64) {
    guard mutationEpochs[key, default: 0] == expectedEpoch else {
      return
    }
    try? persistence.deleteRawData(service: LegacyAuthBridge.keychainService, account: key)
  }

  private func invalidateRefresh(_ key: String) {
    mutationEpochs[key, default: 0] &+= 1
    refreshTasks[key]?.task.cancel()
    refreshTasks[key] = nil
  }

  private func encodeTokenResponse(
    _ responseData: Data,
    nowUnixMs: Int64
  ) throws -> (LegacyStoredAuthTokenPair, Data) {
    guard let responseJson = String(data: responseData, encoding: .utf8) else {
      throw LegacyAuthBridgeError.invalidPayload
    }
    let encodedPtr = responseJson.withCString { cJson in
      affine_ios_auth_encode_token_response_json(cJson, nowUnixMs)
    }
    guard let encodedPtr else {
      throw LegacyAuthBridgeError.invalidPayload
    }
    defer { affine_ios_string_free(encodedPtr) }
    let payloadData = Data(String(cString: encodedPtr).utf8)
    let pair = try JSONDecoder().decode(LegacyStoredAuthTokenPair.self, from: payloadData)
    return (pair, payloadData)
  }
}

private final class AuthBrokerRegistry: @unchecked Sendable {
  static let shared = AuthBrokerRegistry()

  private let lock = NSLock()
  private var defaultKeychainBroker: AuthSessionBroker?
  private var customBrokers: [ObjectIdentifier: AuthSessionBroker] = [:]

  func broker(
    for persistence: LegacyAuthTokenPersistence,
    clientVersion: String
  ) -> AuthSessionBroker {
    lock.lock()
    defer { lock.unlock() }
    if persistence is KeychainAuthTokenPersistence {
      if let existing = defaultKeychainBroker {
        return existing
      }
      let created = AuthSessionBroker(persistence: persistence, clientVersion: clientVersion)
      defaultKeychainBroker = created
      return created
    }
    if type(of: persistence) is AnyClass {
      let obj = persistence as AnyObject
      let key = ObjectIdentifier(obj)
      if let existing = customBrokers[key] {
        return existing
      }
      let created = AuthSessionBroker(persistence: persistence, clientVersion: clientVersion)
      customBrokers[key] = created
      return created
    }
    return AuthSessionBroker(persistence: persistence, clientVersion: clientVersion)
  }
}

/// Native iOS Keychain (`app.affine.pro.auth-token`) and `UserDefaults`
/// (`app.affine.pro.auth-installation-id`) bridge aligned with 0.27.5 `AuthPlugin.swift`.
final class LegacyAuthBridge: @unchecked Sendable {
  static let keychainService = "app.affine.pro.auth-token"
  static let installationIdDefaultsKey = "app.affine.pro.auth-installation-id"
  static let clientKindHeader = "x-affine-client-kind"
  static let clientKindValue = "native"
  static let affineVersionHeader = "x-affine-version"
  static let defaultClientVersion = "0.27.5"
  private static let authCookieNames: Set<String> = [
    "affine_session",
    "affine_user_id",
    "affine_csrf_token",
  ]

  private let userDefaults: UserDefaults
  private let cookieStorage: HTTPCookieStorage
  private let clearWebKitCookies: Bool
  private let clientVersion: String
  private let broker: AuthSessionBroker

  init(
    userDefaults: UserDefaults = .standard,
    persistence: LegacyAuthTokenPersistence = KeychainAuthTokenPersistence(),
    cookieStorage: HTTPCookieStorage = .shared,
    clearWebKitCookies: Bool = true,
    bundle: Bundle = .main
  ) {
    self.userDefaults = userDefaults
    self.cookieStorage = cookieStorage
    self.clearWebKitCookies = clearWebKitCookies
    let resolvedVersion = Self.resolvedClientVersion(bundle: bundle)
    self.clientVersion = resolvedVersion
    self.broker = AuthBrokerRegistry.shared.broker(
      for: persistence,
      clientVersion: resolvedVersion
    )
  }

  /// Resolve `x-affine-version` from `CFBundleShortVersionString`, falling back to `"0.27.5"`.
  static func resolvedClientVersion(bundle: Bundle = .main) -> String {
    if let raw = bundle.infoDictionary?["CFBundleShortVersionString"] as? String {
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        return trimmed
      }
    }
    return defaultClientVersion
  }

  static func canonicalEndpoint(_ endpoint: String) -> String {
    let ptr = endpoint.withCString { affine_ios_auth_canonical_endpoint($0) }
    guard let ptr else { return endpoint }
    defer { affine_ios_string_free(ptr) }
    return String(cString: ptr)
  }

  func canonicalEndpoint(_ endpoint: String) -> String {
    Self.canonicalEndpoint(endpoint)
  }

  /// Reuse the existing `app.affine.pro.auth-installation-id` value without mutation,
  /// generating and persisting a new lowercase UUID only on a genuine fresh install.
  func installationId() -> String {
    let existing = userDefaults.string(forKey: Self.installationIdDefaultsKey)
    var created = false
    let resolvedPtr: UnsafeMutablePointer<CChar>? = existing.map { current in
      current.withCString { cStr in
        affine_ios_auth_resolve_installation_id(cStr, &created)
      }
    } ?? affine_ios_auth_resolve_installation_id(nil, &created)

    guard let resolvedPtr else {
      let fallback = UUID().uuidString.lowercased()
      userDefaults.set(fallback, forKey: Self.installationIdDefaultsKey)
      return fallback
    }
    defer { affine_ios_string_free(resolvedPtr) }
    let resolved = String(cString: resolvedPtr)
    if created {
      userDefaults.set(resolved, forKey: Self.installationIdDefaultsKey)
    }
    return resolved
  }

  func readTokenPair(for endpoint: String) async throws -> LegacyStoredAuthTokenPair? {
    try await broker.readTokenPair(for: endpoint)
  }

  func writeTokenPair(_ pair: LegacyStoredAuthTokenPair, for endpoint: String) async throws {
    try await broker.writeTokenPair(pair, for: endpoint)
  }

  func storeServerTokenResponse(
    _ responseData: Data,
    for endpoint: String,
    nowUnixMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000.0)
  ) async throws -> LegacyStoredAuthTokenPair {
    try await broker.storeServerTokenResponse(responseData, for: endpoint, nowUnixMs: nowUnixMs)
  }

  func deleteTokenPair(for endpoint: String) async throws {
    try await broker.deleteTokenPair(for: endpoint)
  }

  /// Clear local Keychain credentials, increment shared mutation epoch, and clear auth cookies
  /// without issuing a network request (`AuthPlugin.swift:107-110`).
  func clearSession(for endpoint: String) async throws {
    try await broker.deleteTokenPair(for: endpoint)
    await clearAuthCookies(for: endpoint)
  }

  /// Return a valid access token pair or coalesce concurrent refreshes through the actor broker.
  func validAccessToken(
    for endpoint: String,
    minValidity: TimeInterval = 120,
    session: URLSession = .shared
  ) async throws -> LegacyStoredAuthTokenPair? {
    try await broker.validAccessToken(for: endpoint, minValidity: minValidity, session: session)
  }

  /// Rotate tokens via `/api/auth/session/refresh` with single-flight coalescing and epoch guard.
  func refreshSession(
    endpoint: String,
    session: URLSession = .shared
  ) async throws -> LegacyStoredAuthTokenPair {
    try await broker.refreshSession(endpoint: endpoint, session: session)
  }

  /// Exchange an auth code using the preserved `installationId`, store tokens, and clear auth cookies.
  func exchangeSession(
    endpoint: String,
    code: String,
    deviceName: String,
    session: URLSession = .shared
  ) async throws -> LegacyStoredAuthTokenPair {
    let body: [String: String] = [
      "code": code,
      "installationId": installationId(),
      "platform": "ios",
      "deviceName": deviceName,
    ]
    let data = try await Self.postSessionAction(
      endpoint: endpoint,
      action: "/api/auth/session/exchange",
      body: body,
      clientVersion: clientVersion,
      session: session
    )
    let pair = try await broker.storeServerTokenResponse(
      data,
      for: endpoint,
      nowUnixMs: Int64(Date().timeIntervalSince1970 * 1000.0)
    )
    await clearAuthCookies(for: endpoint)
    return pair
  }

  /// Clear local Keychain credentials, increment mutation epoch, and clear auth cookies first,
  /// then revoke the remote session while preserving `installationId`.
  func revokeSession(
    endpoint: String,
    session: URLSession = .shared
  ) async throws {
    let current = try await broker.prepareRevoke(endpoint: endpoint)
    await clearAuthCookies(for: endpoint)
    guard let current else { return }
    _ = try await Self.postSessionAction(
      endpoint: endpoint,
      action: "/api/auth/session/revoke",
      body: ["refreshToken": current.refreshToken],
      clientVersion: clientVersion,
      session: session
    )
  }

  /// Clear legacy auth cookies for the endpoint domain from both `HTTPCookieStorage`
  /// and `WKWebsiteDataStore.default().httpCookieStore` without touching unrelated domains.
  func clearAuthCookies(for endpoint: String) async {
    guard let url = URL(string: canonicalEndpoint(endpoint)), let host = url.host else {
      return
    }
    let normalizedHost = host.lowercased()
    let matches: (HTTPCookie) -> Bool = { cookie in
      let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
      let domainMatches = normalizedHost == domain || normalizedHost.hasSuffix(".\(domain)")
      return domainMatches && Self.authCookieNames.contains(cookie.name)
    }

    cookieStorage.cookies?.forEach { cookie in
      if matches(cookie) {
        cookieStorage.deleteCookie(cookie)
      }
    }

    if clearWebKitCookies {
      await clearWebKitAuthCookies(matching: matches)
    }
  }

  @MainActor
  private func clearWebKitAuthCookies(matching predicate: @escaping (HTTPCookie) -> Bool) async {
    let store = WKWebsiteDataStore.default().httpCookieStore
    let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
      store.getAllCookies { items in
        continuation.resume(returning: items)
      }
    }
    for cookie in cookies where predicate(cookie) {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        store.delete(cookie) {
          continuation.resume()
        }
      }
    }
  }

  fileprivate static func postSessionAction(
    endpoint: String,
    action: String,
    body: [String: String],
    clientVersion: String,
    session: URLSession
  ) async throws -> Data {
    let base = canonicalEndpoint(endpoint)
    guard let url = URL(string: "\(base)\(action)") else {
      throw LegacyAuthBridgeError.invalidEndpoint
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(clientKindValue, forHTTPHeaderField: clientKindHeader)
    request.setValue(clientVersion, forHTTPHeaderField: affineVersionHeader)
    request.httpBody = try JSONEncoder().encode(body)
    request.timeoutInterval = 10

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw LegacyAuthBridgeError.httpFailure(statusCode: -1, permanentlyInvalidatesSession: false)
    }
    guard httpResponse.statusCode < 400 else {
      let permanent: Bool
      if let errorJson = String(data: data, encoding: .utf8) {
        permanent = errorJson.withCString {
          affine_ios_auth_error_permanently_invalidates_session($0)
        }
      } else {
        permanent = false
      }
      throw LegacyAuthBridgeError.httpFailure(
        statusCode: httpResponse.statusCode,
        permanentlyInvalidatesSession: permanent
      )
    }
    return data
  }
}
