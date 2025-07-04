//
//  SafeWKURLSchemeTask.swift
//  App
//
//  Created by EYHN on 2025/1/11.
//

import WebKit

class SafeWKURLSchemeTask: WKURLSchemeTask, NSObject {
  var origin: any WKURLSchemeTask
  init(origin: any WKURLSchemeTask) {
    self.origin = origin
    request = origin.request
  }

  var request: URLRequest

  func didReceive(_: URLResponse) {
    <#code#>
  }

  func didReceive(_: Data) {
    origin.didReceive(<#T##response: URLResponse##URLResponse#>)
  }

  func didFinish() {
    origin.didFinish()
  }

  func didFailWithError(_ error: any Error) {
    origin.didFailWithError(error)
  }
}
