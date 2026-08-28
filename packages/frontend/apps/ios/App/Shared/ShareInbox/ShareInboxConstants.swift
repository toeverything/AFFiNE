//
//  ShareInboxConstants.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

enum ShareInboxConstants {
  static let appGroupId = "group.app.affine.pro"
  static let inboxDirectoryName = "ShareInbox"
  static let attachmentsDirectoryName = "Attachments"
  static let invalidDirectoryName = "Invalid"
  static let workspaceModeFileName = "ShareWorkspaceMode.json"
  static let officialLinkPreviewURL = URL(
    string: "https://app.affine.pro/api/worker/link-preview"
  )!
  static let openInboxURL = URL(string: "affine://share-inbox")!
}
