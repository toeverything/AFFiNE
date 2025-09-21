//
//  IntelligentContext+WebView.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/23/25.
//

import UIKit
import WebKit

extension IntelligentContext {
  func prepareMetadataFrom(webView: WKWebView, completion: @escaping ([WebViewMetadataKey: Any]) -> Void) {
    var newMetadata: [WebViewMetadataKey: Any] = [:]
    let dispatchGroup = DispatchGroup()
    let keysAndScripts: [(WebViewMetadataKey, BridgedWindowScript)] = [
      (.currentDocId, .getCurrentDocId),
      (.currentWorkspaceId, .getCurrentWorkspaceId),
      (.currentServerBaseUrl, .getCurrentServerBaseUrl),
      (.currentI18nLocale, .getCurrentI18nLocale),
      (.currentAiButtonFeatureFlag, .getAiButtonFeatureFlag),
    ]
    for (key, script) in keysAndScripts {
      DispatchQueue.main.async {
        webView.evaluateScript(script) { value in
          newMetadata[key] = value // if unable to fetch, clear it
          dispatchGroup.leave()
        }
      }
      dispatchGroup.enter()
    }
    dispatchGroup.wait()
    completion(newMetadata)
  }
}
