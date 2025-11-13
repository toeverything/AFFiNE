//
//  QLService+URLSessionCookieClient.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/23/25.
//

import Apollo
import Foundation

extension QLService {
  final class URLSessionCookieClient: URLSessionClient {
    init() {
      super.init()
      session.configuration.httpCookieStorage = .init()
      HTTPCookieStorage.shared.cookies?.forEach { cookie in
        self.session.configuration.httpCookieStorage?.setCookie(cookie)
      }
    }
  }
}
