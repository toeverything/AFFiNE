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
  static let currentSchemaVersion = 2

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case importAttemptId
    case id
    case documentId
    case createdAt
    case title
    case content
    case previewRoute
    case target
    case previewText
    case attachments
    case result
    case lastError
  }

  var schemaVersion: Int
  var importAttemptId: String
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
    importAttemptId: String = UUID().uuidString,
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
    self.schemaVersion = Self.currentSchemaVersion
    self.importAttemptId = importAttemptId
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

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
    self.schemaVersion = schemaVersion
    if schemaVersion >= Self.currentSchemaVersion {
      let importAttemptId = try container.decode(String.self, forKey: .importAttemptId)
      guard !importAttemptId.isEmpty else {
        throw DecodingError.dataCorruptedError(
          forKey: .importAttemptId,
          in: container,
          debugDescription: "importAttemptId must not be empty"
        )
      }
      self.importAttemptId = importAttemptId
    } else {
      self.importAttemptId = UUID().uuidString
    }
    self.id = try container.decode(String.self, forKey: .id)
    self.documentId = try container.decode(String.self, forKey: .documentId)
    self.createdAt = try container.decode(Date.self, forKey: .createdAt)
    self.title = try container.decode(String.self, forKey: .title)
    self.content = try container.decode(ShareInboxContent.self, forKey: .content)
    self.previewRoute = try container.decodeIfPresent(SharePreviewRoute.self, forKey: .previewRoute)
    self.target = try container.decodeIfPresent(ShareInboxTarget.self, forKey: .target)
    self.previewText = try container.decodeIfPresent(String.self, forKey: .previewText)
    self.attachments = try container.decodeIfPresent([ShareInboxAttachment].self, forKey: .attachments) ?? []
    self.result = try container.decodeIfPresent(ShareInboxResult.self, forKey: .result)
    self.lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(Self.currentSchemaVersion, forKey: .schemaVersion)
    try container.encode(importAttemptId, forKey: .importAttemptId)
    try container.encode(id, forKey: .id)
    try container.encode(documentId, forKey: .documentId)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encode(title, forKey: .title)
    try container.encode(content, forKey: .content)
    try container.encodeIfPresent(target, forKey: .target)
    try container.encodeIfPresent(previewText, forKey: .previewText)
    try container.encode(attachments, forKey: .attachments)
    try container.encodeIfPresent(result, forKey: .result)
    try container.encodeIfPresent(lastError, forKey: .lastError)
  }
}

enum ShareInboxPendingEntry: Equatable {
  case ready(ShareInboxItem)
  case unsupportedVersion(itemId: String, schemaVersion: Int)

  var createdAt: Date {
    switch self {
    case let .ready(item):
      item.createdAt
    case .unsupportedVersion:
      .distantPast
    }
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
