import Foundation

struct ShareInboxAttachment: Codable, Equatable {
  var fileName: String
  var mimeType: String
  var relativePath: String
}

enum ShareInboxContentKind: String, Codable {
  case url
  case text
  case image
}

struct ShareInboxContent: Codable, Equatable {
  var kind: ShareInboxContentKind
  var url: String?
  var text: String?
}

struct ShareInboxTarget: Codable, Equatable {
  var workspaceId: String
  var workspaceFlavour: String
  var tagIds: [String]
  var collectionId: String?
}

struct ShareInboxResult: Codable, Equatable {
  var docId: String
  var committedAt: Date
}

struct ShareInboxItem: Codable, Equatable, Identifiable {
  var id: String
  var documentId: String
  var createdAt: Date
  var title: String
  var content: ShareInboxContent
  var previewRoute: SharePreviewRoute?
  var target: ShareInboxTarget?
  var previewText: String?
  var attachments: [ShareInboxAttachment]
  var result: ShareInboxResult?
  var lastError: String?

  init(
    id: String = UUID().uuidString,
    documentId: String = UUID().uuidString,
    createdAt: Date = Date(),
    title: String,
    content: ShareInboxContent,
    previewRoute: SharePreviewRoute? = nil,
    target: ShareInboxTarget? = nil,
    previewText: String? = nil,
    attachments: [ShareInboxAttachment] = [],
    result: ShareInboxResult? = nil,
    lastError: String? = nil
  ) {
    self.id = id
    self.documentId = documentId
    self.createdAt = createdAt
    self.title = title
    self.content = content
    self.previewRoute = previewRoute
    self.target = target
    self.previewText = previewText
    self.attachments = attachments
    self.result = result
    self.lastError = lastError
  }
}

struct SharePayloadFile: Equatable {
  var data: Data
  var mimeType: String
  var fileName: String
}

struct SharePayloadDraft: Equatable {
  var title: String
  var content: ShareInboxContent?
  var previewText: String
  var file: SharePayloadFile?
  var errorMessage: String?
}
