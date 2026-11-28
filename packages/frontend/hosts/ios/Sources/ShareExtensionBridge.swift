import Foundation

/// 1:1 mirror of `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxModels.swift`
/// so the thin iOS host consumes the exact files written by the shipping ShareExtension
/// under `<AppGroup:group.app.affine.pro>/ShareInbox/<id>.json` and
/// `ShareInbox/Attachments/<id>/<fileName>`.
struct ShareInboxAttachment: Codable, Equatable {
  var fileName: String
  var mimeType: String
  /// Relative to `ShareInbox/Attachments/` (i.e. `"<item.id>/<fileName>"`).
  var relativePath: String
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

struct ShareInboxItem: Codable, Equatable {
  static let currentSchemaVersion = 2

  var schemaVersion: Int
  var importAttemptId: String
  var id: String
  var documentId: String
  var createdAt: Date
  var title: String
  var content: ShareInboxContent
  var target: ShareInboxTarget?
  var previewRoute: String?
  var previewText: String?
  var attachments: [ShareInboxAttachment]
  var result: ShareInboxResult?
  var lastError: String?

  enum CodingKeys: String, CodingKey {
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

  init(
    id: String = UUID().uuidString,
    documentId: String = UUID().uuidString,
    importAttemptId: String = UUID().uuidString,
    createdAt: Date = Date(),
    title: String,
    content: ShareInboxContent,
    target: ShareInboxTarget? = nil,
    previewRoute: String? = "deferred",
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
    self.target = target
    self.previewRoute = previewRoute
    self.previewText = previewText
    self.attachments = attachments
    self.result = result
    self.lastError = lastError
  }

  /// Matches `ShareInboxModels.swift:123-152`: supports schemaVersion 1 (defaults missing
  /// `importAttemptId` & optional fields) and schemaVersion 2 (requires non-empty `importAttemptId`).
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
    previewRoute = (try? container.decodeIfPresent(String.self, forKey: .previewRoute)) ?? "deferred"
    previewText = try container.decodeIfPresent(String.self, forKey: .previewText)
    attachments =
      try container.decodeIfPresent([ShareInboxAttachment].self, forKey: .attachments) ?? []
    result = try container.decodeIfPresent(ShareInboxResult.self, forKey: .result)
    lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
  }
}

private struct ShareIngestAttachmentSpecPayload: Encodable {
  let blob_key: String
  let file_name: String
  let mime_type: String
  let byte_offset: Int
  let byte_len: Int
}

private struct ShareIngestRequestPayload: Encodable {
  let share_id: String
  let doc_id: String
  let kind: String
  let title: String
  let text_or_url: String
  let attachments: [ShareIngestAttachmentSpecPayload]
  let client_id: UInt64
  let now_ms: Int64
}

private struct ShareIngestOutcomePayload: Decodable {
  let already_committed: Bool
  let doc_id: String
  let inserted_text: String
  let blob_keys: [String]
}

/// Zero-CocoaPods App Group ShareExtension inbox coordinator.
/// Consumes `<AppGroup:group.app.affine.pro>/ShareInbox/<id>.json` and
/// `ShareInbox/Attachments/<id>/<fileName>` through a single atomic Rust SQLite transaction
/// (`blobs` + `updates` + `clocks` + `share_ingest_receipts`).
final class ShareExtensionBridge {
  static let appGroupIdentifier = "group.app.affine.pro"
  static let inboxDirectoryName = "ShareInbox"
  static let attachmentsDirectoryName = "Attachments"
  static let quarantineDirectoryName = "Quarantine"

  private let inboxDirectory: URL

  /// Optional test hook overriding the post-commit passive WAL checkpoint step.
  var checkpointHook: ((WorkspaceStorageBridge) -> Bool)?

  private static func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }

  private static func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }

  init(inboxDirectory: URL? = nil) {
    if let inboxDirectory {
      self.inboxDirectory = inboxDirectory
    } else if let groupUrl = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier
    ) {
      self.inboxDirectory = groupUrl.appendingPathComponent(
        Self.inboxDirectoryName,
        isDirectory: true
      )
    } else {
      self.inboxDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent(Self.inboxDirectoryName, isDirectory: true)
    }
  }

  var attachmentsDirectory: URL {
    inboxDirectory.appendingPathComponent(Self.attachmentsDirectoryName, isDirectory: true)
  }

  var quarantineDirectory: URL {
    inboxDirectory.appendingPathComponent(Self.quarantineDirectoryName, isDirectory: true)
  }

  /// Resolves an attachment `relativePath` (relative to `ShareInbox/Attachments/`,
  /// e.g. `"<item.id>/<fileName>"`) and enforces strict symlink-resolved containment.
  func safeAttachmentURL(relativePath: String) -> URL? {
    let cleaned = relativePath.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !cleaned.isEmpty,
      !cleaned.hasPrefix("/"),
      !cleaned.split(separator: "/").contains("..")
    else {
      return nil
    }
    let base = attachmentsDirectory.standardizedFileURL
    let candidate = base.appendingPathComponent(cleaned).standardizedFileURL
    let resolvedBase = base.resolvingSymlinksInPath().standardizedFileURL
    let resolvedCandidate = candidate.resolvingSymlinksInPath().standardizedFileURL
    guard
      candidate.path.hasPrefix(base.path + "/"),
      resolvedCandidate.path.hasPrefix(resolvedBase.path + "/")
    else {
      return nil
    }
    return candidate
  }

  private func itemAttachmentsDirectory(itemId: String) -> URL? {
    let cleaned = itemId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !cleaned.isEmpty,
      !cleaned.contains("/"),
      cleaned != ".",
      cleaned != ".."
    else {
      return nil
    }
    return attachmentsDirectory.appendingPathComponent(cleaned, isDirectory: true)
  }

  /// Atomically writes one canonical `ShareInbox/<id>.json` item and optional attachments
  /// under `ShareInbox/Attachments/<relativePath>` (`"<item.id>/<fileName>"`).
  func stageItem(_ item: ShareInboxItem, attachmentBlobs: [String: Data] = [:]) throws -> URL {
    let fm = FileManager.default
    try fm.createDirectory(at: inboxDirectory, withIntermediateDirectories: true)
    if !attachmentBlobs.isEmpty {
      try fm.createDirectory(at: attachmentsDirectory, withIntermediateDirectories: true)
      for (relativePath, blob) in attachmentBlobs {
        guard let dest = safeAttachmentURL(relativePath: relativePath) else {
          continue
        }
        try fm.createDirectory(
          at: dest.deletingLastPathComponent(),
          withIntermediateDirectories: true
        )
        try blob.write(to: dest, options: .atomic)
      }
    }
    let sanitizedId = item.id.replacingOccurrences(of: "/", with: "_")
    let target = inboxDirectory.appendingPathComponent("\(sanitizedId).json")
    let data = try Self.makeEncoder().encode(item)
    try data.write(to: target, options: .atomic)
    return target
  }

  private static func peekSchemaVersion(from data: Data) -> Int? {
    guard
      let obj = try? JSONSerialization.jsonObject(with: data, options: []),
      let dict = obj as? [String: Any]
    else {
      return nil
    }
    if let version = dict["schemaVersion"] as? Int {
      return version
    }
    if dict["schemaVersion"] == nil {
      return 1
    }
    return nil
  }

  private func quarantineManifest(at url: URL) {
    let fm = FileManager.default
    try? fm.createDirectory(at: quarantineDirectory, withIntermediateDirectories: true)
    let dest = quarantineDirectory.appendingPathComponent(url.lastPathComponent)
    try? fm.removeItem(at: dest)
    do {
      try fm.moveItem(at: url, to: dest)
    } catch {
      try? fm.removeItem(at: url)
    }
  }

  private func cleanupConsumedItem(manifestUrl: URL, item: ShareInboxItem) {
    let fm = FileManager.default
    try? fm.removeItem(at: manifestUrl)
    if let itemAttDir = itemAttachmentsDirectory(itemId: item.id),
      fm.fileExists(atPath: itemAttDir.path)
    {
      try? fm.removeItem(at: itemAttDir)
    } else {
      for att in item.attachments {
        if let attUrl = safeAttachmentURL(relativePath: att.relativePath) {
          try? fm.removeItem(at: attUrl)
        }
      }
    }
  }

  /// Atomically ingests all pending `ShareInbox/<id>.json` items into `workspace` SQLite
  /// (`blobs` + `updates` + `clocks` + `share_ingest_receipts`).
  ///
  /// Precondition gate: if `workspace == nil` (no mounted workspace), immediately returns `0`
  /// without reading, quarantining, or deleting any file in `ShareInbox/`.
  ///
  /// For `schemaVersion > 2`, skips and preserves the file untouched for forward compatibility.
  /// Only deletes `ShareInbox/<id>.json` and `ShareInbox/Attachments/<id>/` after BOTH the
  /// SQLite `BEGIN IMMEDIATE ... COMMIT` transaction and the passive WAL checkpoint succeed.
  @discardableResult
  func drainAndIngestIntoHost(
    _ host: OpaquePointer?,
    workspace: WorkspaceStorageBridge?,
    docId overrideDocId: String? = nil
  ) -> Int {
    guard let workspace else {
      return 0
    }
    let fm = FileManager.default
    let decoder = Self.makeDecoder()
    guard let urls = try? fm.contentsOfDirectory(
      at: inboxDirectory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) else {
      return 0
    }
    let manifestUrls = urls
      .filter { $0.pathExtension.lowercased() == "json" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }

    var decodedEntries: [(url: URL, item: ShareInboxItem)] = []
    for url in manifestUrls {
      guard let data = try? Data(contentsOf: url) else {
        continue
      }
      guard let schemaVersion = Self.peekSchemaVersion(from: data) else {
        quarantineManifest(at: url)
        continue
      }
      if schemaVersion > ShareInboxItem.currentSchemaVersion {
        // Forward-compatible preservation: never touch newer schema versions.
        continue
      }
      guard let item = try? decoder.decode(ShareInboxItem.self, from: data) else {
        quarantineManifest(at: url)
        continue
      }
      decodedEntries.append((url, item))
    }

    decodedEntries.sort { $0.item.createdAt < $1.item.createdAt }

    var newlyIngested = 0
    var newlyInsertedLines: [String] = []

    for entry in decodedEntries {
      let item = entry.item
      let targetDocId = (overrideDocId?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap {
        $0.isEmpty ? nil : $0
      } ?? item.documentId

      var blobBuffer = Data()
      var attachmentSpecs: [ShareIngestAttachmentSpecPayload] = []
      var attachmentsValid = true

      for att in item.attachments {
        guard
          !att.fileName.isEmpty,
          att.fileName == (att.fileName as NSString).lastPathComponent,
          att.fileName != ".",
          att.fileName != "..",
          att.relativePath == "\(item.id)/\(att.fileName)",
          let attUrl = safeAttachmentURL(relativePath: att.relativePath),
          let values = try? attUrl.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]),
          values.isSymbolicLink != true,
          values.isRegularFile == true,
          let bytes = try? Data(contentsOf: attUrl),
          !bytes.isEmpty
        else {
          attachmentsValid = false
          break
        }
        let offset = blobBuffer.count
        blobBuffer.append(bytes)
        let blobKey = "share-\(item.id)-\(att.fileName)"
        attachmentSpecs.append(
          ShareIngestAttachmentSpecPayload(
            blob_key: blobKey,
            file_name: att.fileName,
            mime_type: att.mimeType,
            byte_offset: offset,
            byte_len: bytes.count
          )
        )
      }

      if !attachmentsValid {
        quarantineManifest(at: entry.url)
        continue
      }

      let textOrUrl: String
      switch item.content.kind {
      case .url:
        let rawUrl = (item.content.url ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard rawUrl.hasPrefix("https://") || rawUrl.hasPrefix("http://") else {
          quarantineManifest(at: entry.url)
          continue
        }
        textOrUrl = rawUrl
      case .text:
        let rawText = (item.content.text ?? item.previewText ?? "").trimmingCharacters(
          in: .whitespacesAndNewlines
        )
        guard !rawText.isEmpty else {
          quarantineManifest(at: entry.url)
          continue
        }
        textOrUrl = rawText
      case .image, .pdf:
        guard !attachmentSpecs.isEmpty else {
          quarantineManifest(at: entry.url)
          continue
        }
        textOrUrl = ""
      }

      let request = ShareIngestRequestPayload(
        share_id: item.id,
        doc_id: targetDocId,
        kind: item.content.kind.rawValue,
        title: item.title,
        text_or_url: textOrUrl,
        attachments: attachmentSpecs,
        client_id: 1,
        now_ms: Int64(Date().timeIntervalSince1970 * 1000.0)
      )
      guard
        let reqData = try? JSONEncoder().encode(request),
        let reqJson = String(data: reqData, encoding: .utf8),
        let outcomeJson = workspace.ingestShareItem(requestJson: reqJson, blobBytes: blobBuffer),
        let outcomeData = outcomeJson.data(using: .utf8),
        let outcome = try? JSONDecoder().decode(ShareIngestOutcomePayload.self, from: outcomeData)
      else {
        // SQLite transaction failed: preserve ShareInbox manifest and attachments for retry.
        continue
      }

      if !outcome.already_committed {
        newlyIngested += 1
        if !outcome.inserted_text.isEmpty {
          newlyInsertedLines.append(outcome.inserted_text)
        }
      }

      let checkpointOk = checkpointHook?(workspace) ?? workspace.checkpointPassive()
      guard checkpointOk else {
        // SQLite COMMIT already recorded `share_ingest_receipts`, so keeping the file
        // untouched lets the next retry hit the receipt idempotently with zero duplication.
        continue
      }

      cleanupConsumedItem(manifestUrl: entry.url, item: item)
    }

    if let host, !newlyInsertedLines.isEmpty {
      let combined = newlyInsertedLines.joined(separator: "\n")
      let utf16 = Array(combined.utf16)
      utf16.withUnsafeBufferPointer { buf in
        if let base = buf.baseAddress {
          affine_ios_host_insert_text(host, base, buf.count)
        }
      }
      affine_ios_host_request_frame(host)
    }

    return newlyIngested
  }
}
