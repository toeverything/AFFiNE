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

  func lastWorkspaceFlavour() -> String? {
    defaults?.string(forKey: ShareInboxConstants.lastWorkspaceFlavourKey)
  }

  func updateWorkspaceCache(
    workspaces: [ShareWorkspaceInfo],
    lastWorkspaceId: String?,
    lastWorkspaceFlavour: String?
  ) {
    guard let defaults else { return }
    if let data = try? encoder.encode(workspaces) {
      defaults.set(data, forKey: ShareInboxConstants.recentWorkspacesKey)
    }
    if let lastWorkspaceId, !lastWorkspaceId.isEmpty {
      defaults.set(lastWorkspaceId, forKey: ShareInboxConstants.lastWorkspaceIdKey)
    } else {
      defaults.removeObject(forKey: ShareInboxConstants.lastWorkspaceIdKey)
    }
    if let lastWorkspaceFlavour, !lastWorkspaceFlavour.isEmpty {
      defaults.set(lastWorkspaceFlavour, forKey: ShareInboxConstants.lastWorkspaceFlavourKey)
    } else {
      defaults.removeObject(forKey: ShareInboxConstants.lastWorkspaceFlavourKey)
    }
  }

  func isImported(_ item: ShareInboxItem) -> Bool {
    guard let id = ShareInboxSafety.normalizedManifestID(item.id) else { return false }
    return importedItemIds().contains(id)
  }

  @discardableResult
  func markImported(_ item: ShareInboxItem) -> Bool {
    guard let defaults,
          let id = ShareInboxSafety.normalizedManifestID(item.id)
    else {
      return false
    }
    var ids = importedItemIds()
    ids.insert(id)
    defaults.set(Array(ids).sorted(), forKey: ShareInboxConstants.importedItemIdsKey)
    return defaults.stringArray(forKey: ShareInboxConstants.importedItemIdsKey)?.contains(id) == true
  }

  func clearImported(_ item: ShareInboxItem) {
    guard let defaults,
          let id = ShareInboxSafety.normalizedManifestID(item.id)
    else {
      return
    }
    var ids = importedItemIds()
    ids.remove(id)
    if ids.isEmpty {
      defaults.removeObject(forKey: ShareInboxConstants.importedItemIdsKey)
    } else {
      defaults.set(Array(ids).sorted(), forKey: ShareInboxConstants.importedItemIdsKey)
    }
  }

  func enqueue(_ item: ShareInboxItem, attachmentData: [(ShareInboxAttachment, Data)] = []) throws {
    guard ensureDirectories(), let inboxDirectoryURL else {
      throw ShareInboxError.containerUnavailable
    }

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

      guard let fileURL = manifestURL(for: item.id) else {
        throw ShareInboxError.invalidPayload
      }
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
        guard let item = try? decoder.decode(ShareInboxItem.self, from: data),
              let expectedURL = manifestURL(for: item.id),
              expectedURL.lastPathComponent.caseInsensitiveCompare(url.lastPathComponent) == .orderedSame
        else {
          return nil
        }
        return item
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
    try fileManager.removeItem(at: fileURL)

    for attachment in item.attachments {
      if let url = attachmentURL(for: attachment) {
        try? fileManager.removeItem(at: url)
        try? fileManager.removeItem(at: url.deletingLastPathComponent())
      }
    }
  }

  private func importedItemIds() -> Set<String> {
    Set(defaults?.stringArray(forKey: ShareInboxConstants.importedItemIdsKey) ?? [])
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
}

enum ShareInboxError: Error {
  case containerUnavailable
  case invalidPayload
}
