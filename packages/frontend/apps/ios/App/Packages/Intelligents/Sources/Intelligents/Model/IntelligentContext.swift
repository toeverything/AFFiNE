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

  public lazy var temporaryDirectory: URL = {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("IntelligentContext")
  }()

  private init() {}

  public func preparePresent(_ completion: @escaping () -> Void) {
    DispatchQueue.global(qos: .userInitiated).async { [self] in
      prepareTemporaryDirectory()
      // TODO: used to gathering information, populate content from webview, etc.
      DispatchQueue.main.async {
        completion()
      }
    }
  }

  func prepareTemporaryDirectory() {
    if FileManager.default.fileExists(atPath: temporaryDirectory.path) {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    try? FileManager.default.createDirectory(
      at: temporaryDirectory,
      withIntermediateDirectories: true
    )
  }
}
