//
//  ShareInboxModels.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

struct ShareWorkspaceInfo: Codable, Equatable, Identifiable, Hashable {
  var id: String
  var name: String
}

struct ShareInboxAttachment: Codable, Equatable {
  var fileName: String
  var mimeType: String
  var relativePath: String
}

struct ShareInboxItem: Codable, Equatable, Identifiable {
  var id: String
  var createdAt: Date
  var title: String
  var markdown: String
  var workspaceId: String?
  var previewText: String?
  var attachments: [ShareInboxAttachment]

  init(
    id: String = UUID().uuidString,
    createdAt: Date = Date(),
    title: String,
    markdown: String,
    workspaceId: String? = nil,
    previewText: String? = nil,
    attachments: [ShareInboxAttachment] = []
  ) {
    self.id = id
    self.createdAt = createdAt
    self.title = title
    self.markdown = markdown
    self.workspaceId = workspaceId
    self.previewText = previewText
    self.attachments = attachments
  }
}

struct SharePayloadDraft: Equatable {
  var title: String
  var markdown: String
  var previewText: String
  var imageData: Data?
  var imageMimeType: String?
  var imageFileName: String?
}
