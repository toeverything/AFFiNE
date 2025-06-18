//
//  IntelligentContext.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/17/25.
//

import Combine
import Foundation
import WebKit

public class IntelligentContext {
  // shared across the app, we expect our app to have a single context and webview
  public static let shared = IntelligentContext()

  public var webView: WKWebView!

  private init() {}

  public func preparePresent(_ completion: @escaping () -> Void) {
    // used to gathering information, populate content from webview, etc.
    // TODO: if needed
    completion()
  }

  // MARK: - Input Processing
}
