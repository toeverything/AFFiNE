//
//  ApplicationBridgedWindowScript.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import Foundation
import WebKit

enum ApplicationBridgedWindowScript: String {
  case getCurrentDocContentInMarkdown = ###"return await window.getCurrentDocContentInMarkdown();"###
  case getCurrentServerBaseUrl = ###"window.getCurrentServerBaseUrl()"###
  case getCurrentWorkspaceId = ###"window.getCurrentWorkspaceId();"###
  case getCurrentDocId = ###"window.getCurrentDocId();"###
  case createNewDocument = ###"window.createNewDocByMarkdownInCurrentWorkspace($ARG_1$, $ARG_2$)"###
  
  var requiresAsyncContext: Bool {
    switch self {
    case .getCurrentDocContentInMarkdown: return true
    default: return false
    }
  }
}

extension WKWebView {
  func evaluateScript(_ script: ApplicationBridgedWindowScript, arguments: [String] = [], callback: @escaping (Any?) -> ()) {
    let escapedArguments = arguments.map { arg in
      let encoded = arg.data(using: .utf8)?.base64EncodedString() ?? ""
      return "atob('\(encoded)')"
    }
    var sourceCode = script.rawValue
    for (idx, argument) in escapedArguments.enumerated() {
      sourceCode = sourceCode.replacingOccurrences(
        of: "$ARG_\(idx + 1)$",
        with: argument
      )
    }
#if DEBUG
    print("[*] evaluating script: \(sourceCode)")
#endif
    if script.requiresAsyncContext {
      callAsyncJavaScript(
        sourceCode,
        arguments: [:],
        in: nil,
        in: .page
      ) { result in
        switch result {
        case .success(let input):
          callback(input)
        case .failure:
          callback(nil)
        }
      }
    } else {
      evaluateJavaScript(sourceCode) { output, _ in
        callback(output)
      }
    }
  }
}


