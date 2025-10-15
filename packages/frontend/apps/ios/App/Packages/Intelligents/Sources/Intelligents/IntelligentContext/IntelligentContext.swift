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
  public static let shared = IntelligentContext()

  public var webView: WKWebView!

  public private(set) var qlMetadata: [QLMetadataKey: Any] = [:]
  public enum QLMetadataKey: String, CaseIterable {
    case accountIdentifier
    case userIdentifierKey
    case userNameKey
    case userEmailKey
    case userAvatarKey
    case userSettingsKey
    case workspacesCountKey
    case workspacesKey
    case subscriptionStatusKey
    case subscriptionPlanKey
    case storageQuotaKey
    case storageUsedKey
  }

  var isAccountValid: Bool {
    true
  }

  public private(set) var webViewMetadata: [WebViewMetadataKey: Any] = [:]
  public enum WebViewMetadataKey: String, CaseIterable {
    case currentDocId
    case currentWorkspaceId
    case currentServerBaseUrl
    case currentI18nLocale
    case currentAiButtonFeatureFlag
  }

  @Published public private(set) var currentSession: ChatSessionObject?
  @Published public private(set) var currentWorkspaceId: String?

  public lazy var temporaryDirectory: URL = {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("IntelligentContext")
  }()

  public enum IntelligentError: Error, LocalizedError {
    case loginRequired(String)
    case sessionCreationFailed(String)
    case featureClosed

    public var errorDescription: String? {
      switch self {
      case let .loginRequired(reason):
        "Login required: \(reason)"
      case let .sessionCreationFailed(reason):
        "Session creation failed: \(reason)"
      case .featureClosed:
        "Intelligent feature closed"
      }
    }
  }

  private init() {}

  public func preparePresent(_ completion: @escaping (Result<Void, Error>) -> Void) {
    assert(webView != nil)
    DispatchQueue.global(qos: .userInitiated).async { [self] in
      prepareTemporaryDirectory()
      prepareMarkdownViewThemes()

      let webViewGroup = DispatchGroup()
      var webViewMetadataResult: [WebViewMetadataKey: Any] = [:]
      webViewGroup.enter()
      prepareMetadataFrom(webView: webView) { metadata in
        webViewMetadataResult = metadata
        webViewGroup.leave()
      }
      webViewGroup.wait()
      webViewMetadata = webViewMetadataResult

      if webViewMetadataResult[.currentAiButtonFeatureFlag] as? Bool == false {
        completion(.failure(IntelligentError.featureClosed))
        return
      }

      // Check required webView metadata
      guard let baseUrlString = webViewMetadataResult[.currentServerBaseUrl] as? String,
            !baseUrlString.isEmpty,
            let url = URL(string: baseUrlString)
      else {
        completion(.failure(IntelligentError.loginRequired("Missing server base URL")))
        return
      }

      guard let workspaceId = webViewMetadataResult[.currentWorkspaceId] as? String,
            !workspaceId.isEmpty
      else {
        completion(.failure(IntelligentError.loginRequired("Missing workspace ID")))
        return
      }

      currentWorkspaceId = workspaceId
      QLService.shared.setEndpoint(base: url)

      let gqlGroup = DispatchGroup()
      var gqlMetadataResult: [QLMetadataKey: Any] = [:]
      gqlGroup.enter()
      prepareMetadataFromGraphQlClient { metadata in
        gqlMetadataResult = metadata
        gqlGroup.leave()
      }
      gqlGroup.wait()
      qlMetadata = gqlMetadataResult

      guard let userIdentifier = gqlMetadataResult[.userIdentifierKey] as? String,
            !userIdentifier.isEmpty
      else {
        completion(.failure(IntelligentError.loginRequired("Missing user identifier")))
        return
      }

      let currentDocumentId: String? = webViewMetadata[.currentDocId] as? String

      dumpMetadataContents()

      createSession(
        workspaceId: workspaceId,
        docId: currentDocumentId
      ) { result in
        switch result {
        case let .success(session):
          self.currentSession = session
          completion(.success(()))
        case let .failure(error):
          completion(.failure(error))
        }
      }
    }
  }

  func dumpMetadataContents() {
    print("\n========== IntelligentContext Metadata ==========")
    print("-- QL Metadata --")
    for key in QLMetadataKey.allCases {
      let value = qlMetadata[key] ?? "<nil>"
      print("\(key.rawValue): \(value)")
    }
    print("\n-- WebView Metadata --")
    for key in WebViewMetadataKey.allCases {
      let value = webViewMetadata[key] ?? "<nil>"
      print("\(key.rawValue): \(value)")
    }
    print("===============================================\n")
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

/*

  dumpMetadataContents sample:

  ========== IntelligentContext Metadata ==========
  -- QL Metadata --
  accountIdentifier: <nil>
  userIdentifierKey: 82a5a6f0-xxxx-xxxx-xxxx-0de4be320696
  userNameKey: Dev User
  userEmailKey: xxx@xxxxx.xxx
  userAvatarKey: https://avatar.affineassets.com/82a5a6f0-xxxx-xxxx-xxxx-0de4be320696-avatar-1733191099480
  userSettingsKey: {
      "__typename" = UserSettingsType;
      receiveInvitationEmail = 1;
      receiveMentionEmail = 1;
  }
  workspacesCountKey: 8
  workspacesKey: [["id": "a0d781bf-xxxx-xxxx-xxxx-19394bad7f24", "team": false], ["id": "b00d1110-xxxx-xxxx-xxxx-4bc39685af7c", "team": false], ["id": "5559196a-xxxx-xxxx-xxxx-fc9ee6e2dbf9", "team": false], ["team": true, "id": "0f58ea6f-xxxx-xxxx-xxxx-30c4b01a346a"], ["id": "c4e72530-xxxx-xxxx-xxxx-888a166c8155", "team": true], ["id": "c924e653-xxxx-xxxx-xxxx-ed4be3a7d7c8", "team": false], ["id": "ac772e5a-xxxx-xxxx-xxxx-4e2049259408", "team": true], ["id": "4dc9c0ca-xxxx-xxxx-xxxx-7b84184f7e1d", "team": true]]
  subscriptionStatusKey: case(AffineGraphQL.SubscriptionStatus.active)
  subscriptionPlanKey: case(AffineGraphQL.SubscriptionPlan.pro)
  storageQuotaKey: 10737418240
  storageUsedKey: <nil>

  -- WebView Metadata --
  currentDocId: <null>
  currentWorkspaceId: <null>
  currentServerBaseUrl: https://affine.fail
  currentI18nLocale: en
  ===============================================

 */
