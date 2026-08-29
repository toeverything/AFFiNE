//
//  ShareInboxStore.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

final class ShareInboxStore {
  typealias DataWriter = (Data, URL, Data.WritingOptions) throws -> Void

  static let shared = ShareInboxStore()

  private let fileManager: FileManager
  private let configuredContainerURL: URL?
  private let writeData: DataWriter
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
    writeData: DataWriter? = nil
  ) {
    self.fileManager = fileManager
    self.configuredContainerURL = containerURL
    self.writeData = writeData ?? Self.writeAtomically
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

  func enqueue(_ item: ShareInboxItem, attachmentData: [(ShareInboxAttachment, Data)] = []) throws {
    guard ensureDirectories() else {
      throw ShareInboxError.containerUnavailable
    }
    guard let fileURL = manifestURL(for: item.id) else {
      throw ShareInboxError.invalidPayload
    }
    try ensureManifestCanMutate(at: fileURL)

    var writtenURLs: [URL] = []
    var writtenParentURLs: [URL] = []
    do {
      for (attachment, data) in attachmentData {
        guard let destination = attachmentURL(for: attachment) else {
          throw ShareInboxError.invalidPayload
        }
        let parent = destination.deletingLastPathComponent()
        try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
        writtenParentURLs.append(parent)
        try data.write(to: destination, options: .atomic)
        writtenURLs.append(destination)
      }

      let data = try encoder.encode(item)
      try writeData(data, fileURL, .atomic)
    } catch {
      for url in writtenURLs {
        try? fileManager.removeItem(at: url)
      }
      for url in writtenParentURLs.reversed() {
        try? fileManager.removeItem(at: url)
      }
      throw error
    }
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
    guard candidate.path.hasPrefix(base.path + "/") else { return nil }
    return candidate
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
