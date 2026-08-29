//
//  ShareInboxStore.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

final class ShareInboxStore {
  typealias DataWriter = (Data, URL, Data.WritingOptions) throws -> Void
  typealias AttachmentFileCopy = (URL, URL) throws -> Void

  static let shared = ShareInboxStore()

  private let fileManager: FileManager
  private let configuredContainerURL: URL?
  private let writeData: DataWriter
  private let copyFile: AttachmentFileCopy
  private let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return encoder
  }()
  private let decoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }()

  init(
    fileManager: FileManager = .default,
    containerURL: URL? = nil,
    writeData: DataWriter? = nil,
    copyFile: AttachmentFileCopy? = nil
  ) {
    self.fileManager = fileManager
    self.configuredContainerURL = containerURL
    self.writeData = writeData ?? Self.writeAtomically
    self.copyFile = copyFile ?? ShareInboxFileCopy.copyCoordinatedFile
  }

  var containerURL: URL? {
    configuredContainerURL
      ?? fileManager.containerURL(forSecurityApplicationGroupIdentifier: ShareInboxConstants.appGroupId)
  }

  private var inboxDirectoryURL: URL? {
    guard let containerURL else { return nil }
    return containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
  }

  private var attachmentsDirectoryURL: URL? {
    guard let inboxDirectoryURL else { return nil }
    return inboxDirectoryURL
      .appendingPathComponent(ShareInboxConstants.attachmentsDirectoryName, isDirectory: true)
  }

  private var invalidDirectoryURL: URL? {
    guard let inboxDirectoryURL else { return nil }
    return inboxDirectoryURL
      .appendingPathComponent(ShareInboxConstants.invalidDirectoryName, isDirectory: true)
  }

  @discardableResult
  func ensureDirectories() -> Bool {
    guard let inboxDirectoryURL, let attachmentsDirectoryURL, let invalidDirectoryURL else {
      return false
    }
    do {
      try fileManager.createDirectory(at: inboxDirectoryURL, withIntermediateDirectories: true)
      try fileManager.createDirectory(at: attachmentsDirectoryURL, withIntermediateDirectories: true)
      try fileManager.createDirectory(at: invalidDirectoryURL, withIntermediateDirectories: true)
      return true
    } catch {
      return false
    }
  }

  func enqueue(
    _ item: ShareInboxItem,
    attachmentFiles: [(ShareInboxAttachment, URL)] = []
  ) throws {
    guard ensureDirectories() else {
      throw ShareInboxError.containerUnavailable
    }
    guard let fileURL = manifestURL(for: item.id) else {
      throw ShareInboxError.invalidPayload
    }
    try ensureManifestCanMutate(at: fileURL)

    guard attachmentFiles.count == item.attachments.count else {
      throw ShareInboxError.invalidPayload
    }
    let attachmentDirectory = attachmentsDirectoryURL?.appendingPathComponent(item.id, isDirectory: true)
    let temporaryAttachmentDirectory = attachmentsDirectoryURL?
      .appendingPathComponent(".\(item.id).tmp", isDirectory: true)
    if !attachmentFiles.isEmpty,
       (attachmentDirectory == nil || temporaryAttachmentDirectory == nil)
    {
      throw ShareInboxError.containerUnavailable
    }
    var publishedAttachmentDirectory: URL?
    do {
      if !attachmentFiles.isEmpty,
         let attachmentDirectory,
         let temporaryAttachmentDirectory
      {
        guard !fileManager.fileExists(atPath: attachmentDirectory.path),
              !fileManager.fileExists(atPath: temporaryAttachmentDirectory.path)
        else {
          throw ShareInboxError.invalidPayload
        }
        try fileManager.createDirectory(at: temporaryAttachmentDirectory, withIntermediateDirectories: false)
        for (index, entry) in attachmentFiles.enumerated() {
          let (attachment, sourceURL) = entry
          guard attachment == item.attachments[index],
                isValidAttachment(attachment, for: item),
                fileManager.fileExists(atPath: sourceURL.path)
          else {
            throw ShareInboxError.invalidPayload
          }
          let destination = temporaryAttachmentDirectory.appendingPathComponent(attachment.fileName)
          try copyFile(sourceURL, destination)
        }
        try fileManager.moveItem(at: temporaryAttachmentDirectory, to: attachmentDirectory)
        publishedAttachmentDirectory = attachmentDirectory
      }

      let data = try encoder.encode(item)
      try writeData(data, fileURL, .atomic)
    } catch {
      if let temporaryAttachmentDirectory {
        try? fileManager.removeItem(at: temporaryAttachmentDirectory)
      }
      if let publishedAttachmentDirectory {
        try? fileManager.removeItem(at: publishedAttachmentDirectory)
      }
      throw error
    }
  }

  private func isValidAttachment(_ attachment: ShareInboxAttachment, for item: ShareInboxItem) -> Bool {
    guard !attachment.fileName.isEmpty,
          attachment.fileName == (attachment.fileName as NSString).lastPathComponent,
          attachment.fileName != ".",
          attachment.fileName != "..",
          attachment.relativePath == "\(item.id)/\(attachment.fileName)",
          attachmentURL(for: attachment) != nil
    else {
      return false
    }
    return true
  }

  func update(_ item: ShareInboxItem) throws {
    guard ensureDirectories(), let fileURL = manifestURL(for: item.id) else {
      throw ShareInboxError.containerUnavailable
    }
    try ensureManifestCanMutate(at: fileURL)
    try writeData(encoder.encode(item), fileURL, .atomic)
  }

  func updateWorkspaceMode(_ mode: ShareWorkspaceMode) throws {
    guard let containerURL else { throw ShareInboxError.containerUnavailable }
    let url = containerURL.appendingPathComponent(ShareInboxConstants.workspaceModeFileName)
    try writeData(encoder.encode(ShareWorkspaceModeSnapshot(mode: mode)), url, .atomic)
  }

  func workspaceMode() -> ShareWorkspaceMode {
    guard let containerURL,
          let data = try? Data(
            contentsOf: containerURL.appendingPathComponent(ShareInboxConstants.workspaceModeFileName)
          )
    else { return .unknown }
    return ShareInboxSafety.workspaceMode(from: data)
  }

  func pendingItems() -> [ShareInboxPendingEntry] {
    guard ensureDirectories(), let inboxDirectoryURL else { return [] }
    guard let urls = try? fileManager.contentsOfDirectory(
      at: inboxDirectoryURL,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else {
      return []
    }

    return urls
      .filter { $0.pathExtension.lowercased() == "json" }
      .compactMap { url -> ShareInboxPendingEntry? in
        guard let data = try? Data(contentsOf: url) else {
          quarantine(url)
          return nil
        }
        guard let schemaVersion = ShareInboxSafety.manifestSchemaVersion(from: data) else {
          quarantine(url)
          return nil
        }
        if schemaVersion > ShareInboxItem.currentSchemaVersion {
          return .unsupportedVersion(
            itemId: url.deletingPathExtension().lastPathComponent,
            schemaVersion: schemaVersion
          )
        }
        guard ShareInboxSafety.normalizedManifestID(url.deletingPathExtension().lastPathComponent) != nil
        else {
          quarantine(url)
          return nil
        }
        guard var item = try? decoder.decode(ShareInboxItem.self, from: data),
              let expectedURL = manifestURL(for: item.id),
              expectedURL.lastPathComponent.caseInsensitiveCompare(url.lastPathComponent) == .orderedSame
        else {
          quarantine(url)
          return nil
        }
        if item.schemaVersion < ShareInboxItem.currentSchemaVersion {
          item.schemaVersion = ShareInboxItem.currentSchemaVersion
          guard (try? update(item)) != nil else { return nil }
        }
        return .ready(item)
      }
      .sorted { $0.createdAt < $1.createdAt }
  }

  func attachmentURL(for attachment: ShareInboxAttachment) -> URL? {
    guard let attachmentsDirectoryURL else { return nil }
    guard !attachment.relativePath.isEmpty,
          !attachment.relativePath.hasPrefix("/"),
          !attachment.relativePath.split(separator: "/").contains("..")
    else {
      return nil
    }
    let base = attachmentsDirectoryURL.standardizedFileURL
    let candidate = base.appendingPathComponent(attachment.relativePath).standardizedFileURL
    let resolvedBase = base.resolvingSymlinksInPath().standardizedFileURL
    let resolvedCandidate = candidate.resolvingSymlinksInPath().standardizedFileURL
    guard candidate.path.hasPrefix(base.path + "/"),
          resolvedCandidate.path.hasPrefix(resolvedBase.path + "/")
    else { return nil }
    return candidate
  }

  func resolveAttachment(for item: ShareInboxItem) -> ShareInboxResolvedAttachment? {
    guard item.attachments.count == 1,
          let attachment = item.attachments.first,
          isValidAttachment(attachment, for: item),
          let url = attachmentURL(for: attachment),
          fileManager.fileExists(atPath: url.path),
          let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey]),
          values.isSymbolicLink != true,
          values.isRegularFile == true,
          let size = values.fileSize,
          size > 0,
          size <= 12 * 1024 * 1024,
          let detectedMimeType = try? ShareInboxSafety.detectRasterImageMimeType(
            ShareInboxFileCopy.readPrefix(from: url)
          ),
          detectedMimeType == attachment.mimeType
    else {
      return nil
    }
    return ShareInboxResolvedAttachment(
      itemId: item.id,
      url: url,
      relativePath: attachment.relativePath,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      size: size
    )
  }

  func remove(_ item: ShareInboxItem) throws {
    guard let fileURL = manifestURL(for: item.id) else {
      throw ShareInboxError.invalidPayload
    }
    try ensureManifestCanMutate(at: fileURL)
    try fileManager.removeItem(at: fileURL)

    for attachment in item.attachments {
      if let url = attachmentURL(for: attachment) {
        try? fileManager.removeItem(at: url)
        try? fileManager.removeItem(at: url.deletingLastPathComponent())
      }
    }
  }

  private func manifestURL(for itemId: String) -> URL? {
    guard let inboxDirectoryURL,
          let normalizedId = ShareInboxSafety.normalizedManifestID(itemId)
    else {
      return nil
    }
    let base = inboxDirectoryURL.standardizedFileURL
    let candidate = base
      .appendingPathComponent("\(normalizedId).json")
      .standardizedFileURL
    guard candidate.path.hasPrefix(base.path + "/") else { return nil }
    return candidate
  }

  private func quarantine(_ url: URL) {
    guard let invalidDirectoryURL else { return }
    let destination = invalidDirectoryURL.appendingPathComponent(url.lastPathComponent)
    try? fileManager.removeItem(at: destination)
    try? fileManager.moveItem(at: url, to: destination)
  }

  private static func writeAtomically(
    _ data: Data,
    _ url: URL,
    _ options: Data.WritingOptions
  ) throws {
    try data.write(to: url, options: options)
  }

  private func ensureManifestCanMutate(at url: URL) throws {
    guard fileManager.fileExists(atPath: url.path) else { return }
    let data = try Data(contentsOf: url)
    guard let schemaVersion = ShareInboxSafety.manifestSchemaVersion(from: data),
          schemaVersion > ShareInboxItem.currentSchemaVersion
    else { return }
    throw ShareInboxError.unsupportedVersion
  }
}

enum ShareInboxError: Error {
  case containerUnavailable
  case invalidPayload
  case payloadTooLarge
  case unsupportedVersion
}

enum ShareInboxFileCopy {
  private static let chunkSize = 64 * 1024

  static func copyCoordinatedFile(from sourceURL: URL, to destinationURL: URL) throws {
    try withCoordinatedRead(sourceURL) { source in
      try copyChunkedFile(from: source, to: destinationURL)
    }
  }

  static func withCoordinatedRead(
    _ sourceURL: URL,
    _ read: (URL) throws -> Void
  ) throws {
    var coordinationError: NSError?
    var readError: Error?
    let coordinator = NSFileCoordinator()
    coordinator.coordinate(readingItemAt: sourceURL, options: [], error: &coordinationError) { source in
      do {
        try read(source)
      } catch {
        readError = error
      }
    }
    if let coordinationError { throw coordinationError }
    if let readError { throw readError }
  }

  static func write(_ data: Data, to destinationURL: URL) throws {
    guard FileManager.default.createFile(atPath: destinationURL.path, contents: nil) else {
      throw ShareInboxError.invalidPayload
    }
    let handle = try FileHandle(forWritingTo: destinationURL)
    defer { try? handle.close() }
    try handle.write(contentsOf: data)
    try handle.synchronize()
  }

  static func readPrefix(from url: URL, count: Int = 12) throws -> Data {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    return try handle.read(upToCount: count) ?? Data()
  }

  static func copyChunkedFile(from sourceURL: URL, to destinationURL: URL) throws {
    guard FileManager.default.createFile(atPath: destinationURL.path, contents: nil) else {
      throw ShareInboxError.invalidPayload
    }
    let input = try FileHandle(forReadingFrom: sourceURL)
    defer { try? input.close() }
    let output = try FileHandle(forWritingTo: destinationURL)
    defer { try? output.close() }
    while let data = try input.read(upToCount: chunkSize), !data.isEmpty {
      try output.write(contentsOf: data)
    }
    try output.synchronize()
  }
}
