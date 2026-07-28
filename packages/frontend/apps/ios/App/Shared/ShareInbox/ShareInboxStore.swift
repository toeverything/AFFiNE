//
//  ShareInboxStore.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

final class ShareInboxStore {
  static let shared = ShareInboxStore()

  private let fileManager = FileManager.default
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

  private init() {}

  var containerURL: URL? {
    fileManager.containerURL(forSecurityApplicationGroupIdentifier: ShareInboxConstants.appGroupId)
  }

  private var defaults: UserDefaults? {
    UserDefaults(suiteName: ShareInboxConstants.appGroupId)
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

  @discardableResult
  func ensureDirectories() -> Bool {
    guard let inboxDirectoryURL, let attachmentsDirectoryURL else { return false }
    do {
      try fileManager.createDirectory(at: inboxDirectoryURL, withIntermediateDirectories: true)
      try fileManager.createDirectory(at: attachmentsDirectoryURL, withIntermediateDirectories: true)
      return true
    } catch {
      return false
    }
  }

  func recentWorkspaces() -> [ShareWorkspaceInfo] {
    guard let data = defaults?.data(forKey: ShareInboxConstants.recentWorkspacesKey) else {
      return []
    }
    return (try? decoder.decode([ShareWorkspaceInfo].self, from: data)) ?? []
  }

  func lastWorkspaceId() -> String? {
    defaults?.string(forKey: ShareInboxConstants.lastWorkspaceIdKey)
  }

  func updateWorkspaceCache(workspaces: [ShareWorkspaceInfo], lastWorkspaceId: String?) {
    guard let defaults else { return }
    if let data = try? encoder.encode(workspaces) {
      defaults.set(data, forKey: ShareInboxConstants.recentWorkspacesKey)
    }
    if let lastWorkspaceId, !lastWorkspaceId.isEmpty {
      defaults.set(lastWorkspaceId, forKey: ShareInboxConstants.lastWorkspaceIdKey)
    }
  }

  func enqueue(_ item: ShareInboxItem, attachmentData: [(ShareInboxAttachment, Data)] = []) throws {
    guard ensureDirectories(), let inboxDirectoryURL, let attachmentsDirectoryURL else {
      throw ShareInboxError.containerUnavailable
    }

    var writtenURLs: [URL] = []
    var writtenParentURLs: [URL] = []
    do {
      for (attachment, data) in attachmentData {
        let destination = attachmentsDirectoryURL.appendingPathComponent(attachment.relativePath)
        let parent = destination.deletingLastPathComponent()
        try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
        writtenParentURLs.append(parent)
        try data.write(to: destination, options: .atomic)
        writtenURLs.append(destination)
      }

      let fileURL = inboxDirectoryURL.appendingPathComponent("\(item.id).json")
      let data = try encoder.encode(item)
      try data.write(to: fileURL, options: .atomic)
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

  func pendingItems() -> [ShareInboxItem] {
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
      .compactMap { url -> ShareInboxItem? in
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(ShareInboxItem.self, from: data)
      }
      .sorted { $0.createdAt < $1.createdAt }
  }

  func attachmentURL(for attachment: ShareInboxAttachment) -> URL? {
    guard let attachmentsDirectoryURL else { return nil }
    return attachmentsDirectoryURL.appendingPathComponent(attachment.relativePath)
  }

  func remove(_ item: ShareInboxItem) {
    guard let inboxDirectoryURL else { return }
    let fileURL = inboxDirectoryURL.appendingPathComponent("\(item.id).json")
    try? fileManager.removeItem(at: fileURL)

    for attachment in item.attachments {
      if let url = attachmentURL(for: attachment) {
        try? fileManager.removeItem(at: url)
        try? fileManager.removeItem(at: url.deletingLastPathComponent())
      }
    }
  }
}

enum ShareInboxError: Error {
  case containerUnavailable
  case invalidPayload
}
