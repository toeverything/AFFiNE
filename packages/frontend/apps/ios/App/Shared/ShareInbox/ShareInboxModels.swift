import Foundation

struct ShareInboxAttachment: Codable, Equatable {
  var fileName: String
  var mimeType: String
  var relativePath: String
}

struct ShareInboxResolvedAttachment: Equatable {
  var itemId: String
  var url: URL
  var relativePath: String
  var name: String
  var mimeType: String
  var size: Int
}

enum ShareInboxContentKind: String, Codable {
  case url
  case text
  case image
  case pdf
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

enum SharePreviewRoute: String, Codable {
  case official
  case deferred
}

enum ShareWorkspaceMode: String, Codable {
  case selfHostedPresent
  case cloudOnly
  case signedOut
  case unknown
}

struct ShareWorkspaceModeSnapshot: Codable {
  var version = 1
  var mode: ShareWorkspaceMode
  var updatedAt = Date()
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
    case target
    case previewRoute
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
  var target: ShareInboxTarget?
  var previewRoute: SharePreviewRoute
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
    target: ShareInboxTarget? = nil,
    previewRoute: SharePreviewRoute = .deferred,
    previewText: String? = nil,
    attachments: [ShareInboxAttachment] = [],
    result: ShareInboxResult? = nil,
    lastError: String? = nil
  ) {
    schemaVersion = Self.currentSchemaVersion
    self.importAttemptId = importAttemptId
    self.id = id
    self.documentId = documentId
    self.createdAt = createdAt
    self.title = title
    self.content = content
    self.target = target
    self.previewRoute = previewRoute
    self.previewText = previewText
    self.attachments = attachments
    self.result = result
    self.lastError = lastError
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
    self.schemaVersion = schemaVersion
    if schemaVersion == 1 {
      importAttemptId = UUID().uuidString
    } else {
      let importAttemptId = try container.decode(String.self, forKey: .importAttemptId)
      guard !importAttemptId.isEmpty else {
        throw DecodingError.dataCorruptedError(
          forKey: .importAttemptId,
          in: container,
          debugDescription: "importAttemptId must not be empty"
        )
      }
      self.importAttemptId = importAttemptId
    }
    id = try container.decode(String.self, forKey: .id)
    documentId = try container.decode(String.self, forKey: .documentId)
    createdAt = try container.decode(Date.self, forKey: .createdAt)
    title = try container.decode(String.self, forKey: .title)
    content = try container.decode(ShareInboxContent.self, forKey: .content)
    target = try container.decodeIfPresent(ShareInboxTarget.self, forKey: .target)
    previewRoute = (try? container.decode(SharePreviewRoute.self, forKey: .previewRoute)) ?? .deferred
    previewText = try container.decodeIfPresent(String.self, forKey: .previewText)
    attachments =
      try container.decodeIfPresent([ShareInboxAttachment].self, forKey: .attachments) ?? []
    result = try container.decodeIfPresent(ShareInboxResult.self, forKey: .result)
    lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
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
    try container.encode(previewRoute, forKey: .previewRoute)
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
      .distantFuture
    }
  }
}

struct SharePayloadFile: Equatable {
  var ownedStagingURL: URL
  var name: String
  var mimeType: String
  var size: Int
  var thumbnailData: Data
}

struct SharePayloadDraft: Equatable {
  var title: String
  var content: ShareInboxContent?
  var previewText: String
  var file: SharePayloadFile?
  var errorMessage: String?

  func discardStagingFiles() {
    guard let file else { return }
    SharePayloadBuilder.removeOwnedStagingFile(at: file.ownedStagingURL)
  }
}
