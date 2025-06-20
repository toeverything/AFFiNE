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

  public private(set) var metadata: [MetadataKey: Any] = [:]
  public enum MetadataKey: String {
    case currentDocId
    case currentWorkspaceId
    case currentServerBaseUrl
    case currentI18nLocale
  }

  public lazy var temporaryDirectory: URL = {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("IntelligentContext")
  }()

  private init() {}

  public func preparePresent(_ completion: @escaping () -> Void) {
    DispatchQueue.global(qos: .userInitiated).async { [self] in
      prepareTemporaryDirectory()

      let group = DispatchGroup()
      var newMetadata: [MetadataKey: Any] = [:]
      let keysAndScripts: [(MetadataKey, BridgedWindowScript)] = [
        (.currentDocId, .getCurrentDocId),
        (.currentWorkspaceId, .getCurrentWorkspaceId),
        (.currentServerBaseUrl, .getCurrentServerBaseUrl),
        (.currentI18nLocale, .getCurrentI18nLocale)
      ]
      for (key, script) in keysAndScripts {
        DispatchQueue.main.async {
          self.webView.evaluateScript(script) { value in
            newMetadata[key] = value // if unable to fetch, clear it
            group.leave()
          }
        }
        group.enter()
      }
      self.metadata = newMetadata
      group.wait()
      print("IntelligentContext metadata prepared: \(self.metadata)")
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
