//
//  ShareInboxConstants.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

enum ShareInboxConstants {
  static let appGroupId = "group.app.affine.pro"
  static let inboxDirectoryName = "ShareInbox"
  static let attachmentsDirectoryName = "Attachments"
  static let recentWorkspacesKey = "share.recentWorkspaces"
  static let lastWorkspaceIdKey = "share.lastWorkspaceId"
  static let lastWorkspaceFlavourKey = "share.lastWorkspaceFlavour"
  static let openInboxURL = URL(string: "affine://share-inbox")!
}
