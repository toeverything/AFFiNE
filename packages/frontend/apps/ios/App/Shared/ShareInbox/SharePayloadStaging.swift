import Foundation
import PDFKit
import UIKit

extension SharePayloadBuilder {
  static func stageImage(
    from sourceURL: URL,
    suggestedName: String?,
    copyFile: @escaping FileCopy = ShareInboxFileCopy.copyChunkedFile,
    coordinatedRead: @escaping CoordinatedRead = ShareInboxFileCopy.withCoordinatedRead
  ) throws -> SharePayloadFile {
    removeStaleStagingDirectories()
    let didAccessSecurityScopedResource = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if didAccessSecurityScopedResource {
        sourceURL.stopAccessingSecurityScopedResource()
      }
    }
    var stagedFile: SharePayloadFile?
    try coordinatedRead(sourceURL) { coordinatedURL in
      let values = try coordinatedURL.resourceValues(forKeys: [.fileSizeKey])
      guard let size = values.fileSize, size <= maxImageBytes else {
        throw ShareInboxError.payloadTooLarge
      }
      guard let mimeType = ShareInboxSafety.detectRasterImageMimeType(
        try ShareInboxFileCopy.readPrefix(from: coordinatedURL)
      ) else {
        throw ShareInboxError.invalidPayload
      }
      stagedFile = try stageImage(
        name: normalizedFileName(suggestedName ?? coordinatedURL.lastPathComponent, mimeType: mimeType),
        mimeType: mimeType,
        size: size,
        write: { destination in try copyFile(coordinatedURL, destination) }
      )
    }
    guard let stagedFile else { throw ShareInboxError.invalidPayload }
    return stagedFile
  }

  static func stagePDF(
    from sourceURL: URL,
    suggestedName: String?,
    declaredTypeIdentifier: String,
    copyFile: @escaping FileCopy = ShareInboxFileCopy.copyChunkedFile,
    coordinatedRead: @escaping CoordinatedRead = ShareInboxFileCopy.withCoordinatedRead,
    renderThumbnail: @escaping (URL) throws -> Data = pdfThumbnailData
  ) throws -> SharePayloadFile {
    guard ShareInboxSafety.isPDFTypeIdentifier(declaredTypeIdentifier) else {
      throw ShareInboxError.invalidPayload
    }
    removeStaleStagingDirectories()
    let didAccessSecurityScopedResource = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if didAccessSecurityScopedResource {
        sourceURL.stopAccessingSecurityScopedResource()
      }
    }
    var stagedFile: SharePayloadFile?
    try coordinatedRead(sourceURL) { coordinatedURL in
      let values = try coordinatedURL.resourceValues(forKeys: [.fileSizeKey])
      guard let size = values.fileSize, size > 0 else {
        throw ShareInboxError.invalidPayload
      }
      guard size <= ShareInboxConstants.maxShareAttachmentBytes else {
        throw ShareInboxError.payloadTooLarge
      }
      guard ShareInboxSafety.detectPDFMimeType(try ShareInboxFileCopy.readPrefix(from: coordinatedURL))
        == "application/pdf"
      else { throw ShareInboxError.invalidPayload }
      stagedFile = try stagePDF(
        name: normalizedPDFFileName(suggestedName ?? coordinatedURL.lastPathComponent),
        size: size,
        write: { destination in try copyFile(coordinatedURL, destination) },
        renderThumbnail: renderThumbnail
      )
    }
    guard let stagedFile else { throw ShareInboxError.invalidPayload }
    return stagedFile
  }

  static func removeOwnedStagingFile(at url: URL) {
    let directory = url.deletingLastPathComponent().standardizedFileURL
    let root = ShareInboxConstants.stagingDirectoryURL.standardizedFileURL
    guard directory.deletingLastPathComponent() == root,
          directory.lastPathComponent.hasPrefix(".") == false
    else {
      return
    }
    try? FileManager.default.removeItem(at: directory)
  }

  static func stageImage(
    name: String,
    mimeType: String,
    size: Int,
    write: (URL) throws -> Void
  ) throws -> SharePayloadFile {
    let fileManager = FileManager.default
    let root = ShareInboxConstants.stagingDirectoryURL
    try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    let identifier = UUID().uuidString
    let temporaryDirectory = root.appendingPathComponent(".\(identifier).tmp", isDirectory: true)
    let finalDirectory = root.appendingPathComponent(identifier, isDirectory: true)
    var didPublish = false
    defer {
      if !didPublish {
        try? fileManager.removeItem(at: temporaryDirectory)
      }
    }

    try fileManager.createDirectory(at: temporaryDirectory, withIntermediateDirectories: false)
    let destination = temporaryDirectory.appendingPathComponent(name)
    try write(destination)
    guard let detectedMimeType = ShareInboxSafety.detectRasterImageMimeType(
      try ShareInboxFileCopy.readPrefix(from: destination)
    ), detectedMimeType == mimeType
    else {
      throw ShareInboxError.invalidPayload
    }
    let actualSize = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard actualSize == size, actualSize <= maxImageBytes else {
      throw ShareInboxError.payloadTooLarge
    }
    try fileManager.moveItem(at: temporaryDirectory, to: finalDirectory)
    didPublish = true
    let ownedStagingURL = finalDirectory.appendingPathComponent(name)
    return SharePayloadFile(
      ownedStagingURL: ownedStagingURL,
      name: name,
      mimeType: mimeType,
      size: actualSize,
      thumbnailData: thumbnailData(for: ownedStagingURL)
    )
  }

  static func stagePDF(
    name: String,
    size: Int,
    write: (URL) throws -> Void,
    renderThumbnail: (URL) throws -> Data
  ) throws -> SharePayloadFile {
    let fileManager = FileManager.default
    let root = ShareInboxConstants.stagingDirectoryURL
    try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    let identifier = UUID().uuidString
    let temporaryDirectory = root.appendingPathComponent(".\(identifier).tmp", isDirectory: true)
    let finalDirectory = root.appendingPathComponent(identifier, isDirectory: true)
    var didPublish = false
    defer {
      if !didPublish {
        try? fileManager.removeItem(at: temporaryDirectory)
      }
    }

    try fileManager.createDirectory(at: temporaryDirectory, withIntermediateDirectories: false)
    let destination = temporaryDirectory.appendingPathComponent(name)
    try write(destination)
    let actualSize = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard actualSize == size, actualSize > 0 else {
      throw ShareInboxError.invalidPayload
    }
    guard actualSize <= ShareInboxConstants.maxShareAttachmentBytes else {
      throw ShareInboxError.payloadTooLarge
    }
    guard ShareInboxSafety.detectPDFMimeType(try ShareInboxFileCopy.readPrefix(from: destination))
      == "application/pdf"
    else { throw ShareInboxError.invalidPayload }
    try fileManager.moveItem(at: temporaryDirectory, to: finalDirectory)
    didPublish = true
    let ownedStagingURL = finalDirectory.appendingPathComponent(name)
    let thumbnail = (try? renderThumbnail(ownedStagingURL)) ?? Data()
    return SharePayloadFile(
      ownedStagingURL: ownedStagingURL,
      name: name,
      mimeType: "application/pdf",
      size: actualSize,
      thumbnailData: thumbnail.count <= ShareInboxConstants.maxThumbnailBytes ? thumbnail : Data()
    )
  }

  static func removeStaleStagingDirectories(now: Date = .now) {
    let fileManager = FileManager.default
    let root = ShareInboxConstants.stagingDirectoryURL
    try? fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    guard let directories = try? fileManager.contentsOfDirectory(
      at: root,
      includingPropertiesForKeys: [.contentModificationDateKey, .isDirectoryKey],
      options: []
    ) else {
      return
    }
    for directory in directories {
      let values = try? directory.resourceValues(forKeys: [.contentModificationDateKey, .isDirectoryKey])
      guard values?.isDirectory == true,
            let modifiedAt = values?.contentModificationDate,
            now.timeIntervalSince(modifiedAt) > ShareInboxConstants.stagingMaxAge
      else {
        continue
      }
      try? fileManager.removeItem(at: directory)
    }
  }

  private static func thumbnailData(for url: URL) -> Data {
    guard let image = UIImage(contentsOfFile: url.path),
          let thumbnail = image.preparingThumbnail(of: CGSize(width: 480, height: 480))
    else {
      return (try? ShareInboxFileCopy.readPrefix(
        from: url,
        count: ShareInboxConstants.maxThumbnailBytes
      )) ?? Data()
    }
    var quality: CGFloat = 0.8
    while quality >= 0.2 {
      if let data = thumbnail.jpegData(compressionQuality: quality),
         data.count <= ShareInboxConstants.maxThumbnailBytes
      {
        return data
      }
      quality -= 0.15
    }
    return Data()
  }

  private static func pdfThumbnailData(for url: URL) throws -> Data {
    guard let document = PDFDocument(url: url),
          let page = document.page(at: 0)
    else {
      throw ShareInboxError.invalidPayload
    }
    let thumbnail = page.thumbnail(
      of: CGSize(width: 480, height: 480),
      for: .mediaBox
    )
    var quality: CGFloat = 0.8
    while quality >= 0.2 {
      if let data = thumbnail.jpegData(compressionQuality: quality),
         data.count <= ShareInboxConstants.maxThumbnailBytes
      {
        return data
      }
      quality -= 0.15
    }
    return Data()
  }

  private static func normalizedFileName(_ value: String, mimeType: String) -> String {
    let fileExtension = fileExtension(for: mimeType)
    let baseName = nonEmpty((value as NSString).lastPathComponent)
      .map { ($0 as NSString).lastPathComponent }
      .flatMap { nonEmpty(($0 as NSString).deletingPathExtension) }
      ?? "shared-image"
    return "\(baseName).\(fileExtension)"
  }

  private static func normalizedPDFFileName(_ value: String) -> String {
    let baseName = nonEmpty((value as NSString).lastPathComponent)
      .flatMap { nonEmpty(($0 as NSString).deletingPathExtension) }
      ?? "shared-document"
    return "\(baseName).pdf"
  }

  private static func fileExtension(for mimeType: String) -> String {
    switch mimeType {
    case "image/png": "png"
    case "image/gif": "gif"
    case "image/webp": "webp"
    case "image/heic": "heic"
    default: "jpg"
    }
  }
}
