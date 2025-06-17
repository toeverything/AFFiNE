// The Swift Programming Language
// https://docs.swift.org/swift-book

import AffineGraphQL
import Apollo
import Foundation

public enum Intelligents {}

private extension Intelligents {
  private final class URLSessionCookieClient: URLSessionClient {
    init() {
      super.init()
      session.configuration.httpCookieStorage = .init()
      HTTPCookieStorage.shared.cookies?.forEach { cookie in
        self.session.configuration.httpCookieStorage?.setCookie(cookie)
      }
    }
  }
}
