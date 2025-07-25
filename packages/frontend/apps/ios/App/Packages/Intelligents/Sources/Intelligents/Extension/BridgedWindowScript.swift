//
//  BridgedWindowScript.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import Foundation
import WebKit

/*
 packages/frontend/apps/ios/src/app.tsx
 */

enum BridgedWindowScript: String {
  case getCurrentDocContentInMarkdown = "return await window.getCurrentDocContentInMarkdown();"
  case getCurrentServerBaseUrl = "window.getCurrentServerBaseUrl()"
  case getCurrentWorkspaceId = "window.getCurrentWorkspaceId();"
  case getCurrentDocId = "window.getCurrentDocId();"
  case getAiButtonFeatureFlag = "window.getAiButtonFeatureFlag();"
  case getCurrentI18nLocale = "window.getCurrentI18nLocale();"
  case createNewDocByMarkdownInCurrentWorkspace = "return await window.createNewDocByMarkdownInCurrentWorkspace(markdown, title);"

  var requiresAsyncContext: Bool {
    switch self {
    case .getCurrentDocContentInMarkdown, .createNewDocByMarkdownInCurrentWorkspace: true
    default: false
    }
  }
}

extension WKWebView {
  func evaluateScript(_ script: BridgedWindowScript, callback: @escaping (Any?) -> Void) {
    if script.requiresAsyncContext {
      callAsyncJavaScript(
        script.rawValue,
        arguments: [:],
        in: nil,
        in: .page
      ) { result in
        switch result {
        case let .success(input):
          callback(input)
        case .failure:
          callback(nil)
        }
      }
    } else {
      evaluateJavaScript(script.rawValue) { output, _ in callback(output) }
    }
  }
}
