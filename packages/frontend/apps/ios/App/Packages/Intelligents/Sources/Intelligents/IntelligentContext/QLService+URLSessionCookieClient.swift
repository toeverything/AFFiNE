//
//  QLService+URLSessionCookieClient.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/23/25.
//

import Apollo
import AffineGraphQL
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
  func authorized(_ request: URLRequest) -> URLRequest {
    guard request.value(forHTTPHeaderField: "Authorization") == nil,
          let requestURL = request.url,
          let token = AuthAccessTokenCache.shared.token(
            for: requestURL, matching: serverBaseURL)
    else {
      return request
    }

    var authorized = request
    authorized.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return authorized
  }
}
