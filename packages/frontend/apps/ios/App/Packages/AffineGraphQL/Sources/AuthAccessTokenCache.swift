import Foundation

public final class AuthAccessTokenCache: @unchecked Sendable {
  public static let shared = AuthAccessTokenCache()

  private struct Entry {
    let token: String
    let expiresAt: Date
  }

  private let lock = NSLock()
  private var entries: [String: Entry] = [:]

  private init() {}

  public func set(_ token: String, expiresAt: Date, for endpoint: String) {
    guard let key = Self.canonicalOrigin(endpoint) else { return }
    lock.lock()
    entries[key] = Entry(token: token, expiresAt: expiresAt)
    lock.unlock()
  }

  public func token(for endpoint: URL, minimumValidity: TimeInterval = 0) -> String? {
    token(for: endpoint, matching: nil, minimumValidity: minimumValidity)
  }

  public func token(
    for endpoint: URL,
    matching origin: URL?,
    minimumValidity: TimeInterval = 0
  ) -> String? {
    guard let key = Self.canonicalOrigin(endpoint) else { return nil }
    if let origin, Self.canonicalOrigin(origin) != key { return nil }
    lock.lock()
    defer { lock.unlock() }

    guard let entry = entries[key], entry.expiresAt.timeIntervalSinceNow > minimumValidity else {
      return nil
    }
    return entry.token
  }

  public func remove(for endpoint: String) {
    guard let key = Self.canonicalOrigin(endpoint) else { return }
    lock.lock()
    entries[key] = nil
    lock.unlock()
  }

  private static func canonicalOrigin(_ endpoint: String) -> String? {
    guard let url = URL(string: endpoint) else { return nil }
    return canonicalOrigin(url)
  }

  private static func canonicalOrigin(_ url: URL) -> String? {
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
