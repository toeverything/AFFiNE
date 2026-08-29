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
  static let stagingDirectoryName = "affine-share-inbox-staging"
  static let maxThumbnailBytes = 256 * 1024
  static let stagingMaxAge: TimeInterval = 24 * 60 * 60
  static let workspaceModeFileName = "ShareWorkspaceMode.json"
  static let officialLinkPreviewURL = URL(
    string: "https://app.affine.pro/api/worker/link-preview"
  )!
  static let openInboxURL = URL(string: "affine://share-inbox")!

  static var stagingDirectoryURL: URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent(stagingDirectoryName, isDirectory: true)
  }
}
