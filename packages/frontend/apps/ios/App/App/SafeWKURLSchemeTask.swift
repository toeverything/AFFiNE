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
    self.request = origin.request
  }
  
  var request: URLRequest
  
  func didReceive(_ response: URLResponse) {
    <#code#>
  }
  
  func didReceive(_ data: Data) {
    self.origin.didReceive(<#T##response: URLResponse##URLResponse#>)
  }
  
  func didFinish() {
    self.origin.didFinish()
  }
  
  func didFailWithError(_ error: any Error) {
    self.origin.didFailWithError(error)
  }
  
  
}
