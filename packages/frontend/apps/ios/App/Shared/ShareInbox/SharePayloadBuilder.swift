import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
  private static let maxImageBytes = 12 * 1024 * 1024
  private static let maxTextCharacters = 250_000
  typealias FileCopy = (URL, URL) throws -> Void
  typealias CoordinatedRead = (URL, (URL) throws -> Void) throws -> Void

  private struct ImageFileRepresentationUnavailable: Error {}

  private final class ProviderLoadState<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private let discard: (Value) -> Void
    private var continuation: CheckedContinuation<Value, Error>?
    private var progress: Progress?
    private var isFinished = false
    private var isCancelled = false

    init(discard: @escaping (Value) -> Void) {
      self.discard = discard
    }

    func install(_ continuation: CheckedContinuation<Value, Error>) {
      lock.lock()
      if isCancelled {
        lock.unlock()
        continuation.resume(throwing: CancellationError())
        return
      }
      self.continuation = continuation
      lock.unlock()
    }

    func install(_ progress: Progress?) {
      lock.lock()
      if isCancelled {
        lock.unlock()
        progress?.cancel()
        return
      }
      if !isFinished {
        self.progress = progress
      }
      lock.unlock()
    }

    func resume(with result: Result<Value, Error>) {
      lock.lock()
      guard !isFinished else {
        lock.unlock()
        if case .success(let value) = result {
          discard(value)
        }
        return
      }
      isFinished = true
      let continuation = continuation
      self.continuation = nil
      progress = nil
      lock.unlock()
      continuation?.resume(with: result)
    }

    func cancel() {
      lock.lock()
      guard !isFinished else {
        lock.unlock()
        return
      }
      isFinished = true
      isCancelled = true
      let continuation = continuation
      let progress = progress
      self.continuation = nil
      self.progress = nil
      lock.unlock()
      progress?.cancel()
      continuation?.resume(throwing: CancellationError())
    }
  }

  static func build(from extensionItems: [NSExtensionItem]) async -> SharePayloadDraft {
    removeStaleStagingDirectories()
    var title = "Shared"
    var url: String?
    var text: String?
    var fallbackText: String?
    var file: SharePayloadFile?
    var contexts: [(item: NSExtensionItem, providers: [ProviderContext])] = []

    defer {
      if Task.isCancelled, let file {
        removeOwnedStagingFile(at: file.ownedStagingURL)
      }
    }

    for item in extensionItems {
      var providers: [ProviderContext] = []
      for provider in item.attachments ?? [] {
        providers.append(await providerContext(for: provider))
        guard !Task.isCancelled else {
          return failure(title: title, message: "Share cancelled.")
        }
      }
      contexts.append((item: item, providers: providers))
    }

    let containsWebURL = contexts.flatMap(\.providers).contains { $0.webURL != nil }
    let localBinaryProviders = contexts.flatMap(\.providers).filter {
      ($0.hasImage || $0.hasPDF) && !$0.blocksBinaryFallback
    }
    guard localBinaryProviders.count <= 1 else {
      return failure(title: title, message: "Share one image or PDF at a time.")
    }

    for context in contexts {
      for providerContext in context.providers {
        guard !Task.isCancelled else {
          return failure(title: title, message: "Share cancelled.")
        }
        let provider = providerContext.provider
        if let page = providerContext.safariPage {
          title = page.title ?? title
          url = page.url ?? url
          text = page.selectedText.map {
            String($0.prefix(maxTextCharacters))
          } ?? text
        }

        if let webURL = providerContext.webURL {
          url = url ?? webURL.absoluteString
          if title == "Shared" {
            title = webURL.host ?? webURL.absoluteString
          }
        }

        if fallbackText == nil,
           provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let loadedText = try? await loadText(from: provider)
        {
          let trimmed = loadedText.trimmingCharacters(in: .whitespacesAndNewlines)
          if !trimmed.isEmpty, trimmed != url {
            fallbackText = String(trimmed.prefix(maxTextCharacters))
          }
        }
        guard !Task.isCancelled else {
          return failure(title: title, message: "Share cancelled.")
        }

        let hasImage = providerContext.hasImage
          && !providerContext.blocksBinaryFallback
          && !containsWebURL
        let hasPDF = providerContext.hasPDF
          && !providerContext.blocksBinaryFallback
          && !containsWebURL
        if hasImage || hasPDF {
          do {
            file = try await (hasPDF ? loadPDF(from: provider) : loadImage(from: provider))
            try Task.checkCancellation()
          } catch is CancellationError {
            return failure(title: title, message: "Share cancelled.")
          } catch ShareInboxError.payloadTooLarge {
            let message = hasPDF
              ? "The PDF must be smaller than 64 MB."
              : "The image must be smaller than 12 MB."
            return failure(title: title, message: message)
          } catch {
            let message = hasPDF
              ? "This PDF file is not supported."
              : "This image format is not supported."
            return failure(title: title, message: message)
          }
        }
      }

      if let attributedText = nonEmpty(context.item.attributedContentText?.string),
         attributedText != url
      {
        if title == "Shared" {
          title = firstNonEmptyLine(attributedText)
        }
        if fallbackText == nil {
          fallbackText = String(attributedText.prefix(maxTextCharacters))
        }
      }
    }

    if text == nil, url == nil {
      text = fallbackText
    }
    if title == "Shared" {
      if let file {
        title = (file.name as NSString).deletingPathExtension
      } else if let url, let host = URL(string: url)?.host {
        title = host
      } else if let fallbackText {
        title = firstNonEmptyLine(fallbackText)
      }
    }

    let content: ShareInboxContent?
    if let file {
      content = ShareInboxContent(
        kind: file.mimeType == "application/pdf" ? .pdf : .image,
        url: url,
        text: text
      )
    } else if let url {
      content = ShareInboxContent(kind: .url, url: url, text: text)
    } else if let text {
      content = ShareInboxContent(kind: .text, url: nil, text: text)
    } else {
      content = nil
    }

    guard let content else {
      return failure(
        title: title,
        message: "AFFiNE can currently save links, text, one image, or one PDF."
      )
    }

    let preview = text ?? url ?? file?.name ?? "Shared content"
    return SharePayloadDraft(
      title: sanitizeTitle(title),
      content: content,
      previewText: String(preview.prefix(280)),
      file: file,
      errorMessage: nil
    )
  }

  private static func failure(title: String, message: String) -> SharePayloadDraft {
    SharePayloadDraft(
      title: sanitizeTitle(title),
      content: nil,
      previewText: "",
      file: nil,
      errorMessage: message
    )
  }

  private struct SafariPage {
    var title: String?
    var url: String?
    var selectedText: String?
  }

  private struct ProviderContext {
    let provider: NSItemProvider
    let safariPage: SafariPage?
    let webURL: URL?
    let blocksBinaryFallback: Bool
    let hasImage: Bool
    let hasPDF: Bool

  }

  private static func providerContext(for provider: NSItemProvider) async -> ProviderContext {
    let hasPropertyList = provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier)
    let hasURL = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
    let safariPage = hasPropertyList
      ? try? await loadSafariPage(from: provider)
      : nil
    var loadedURL = safariPage?.url.flatMap(URL.init(string:))
    if loadedURL == nil, hasURL, !Task.isCancelled {
      loadedURL = try? await loadURL(from: provider)
    }
    let webURL = loadedURL.flatMap { ShareInboxSafety.normalizedWebURL($0.absoluteString) }
      .flatMap(URL.init(string:))
    return ProviderContext(
      provider: provider,
      safariPage: safariPage,
      webURL: webURL,
      blocksBinaryFallback: (hasPropertyList || hasURL) && loadedURL?.isFileURL != true,
      hasImage: provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
      hasPDF: provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier)
    )
  }

  private static func loadSafariPage(from provider: NSItemProvider) async throws -> SafariPage {
    let item: Any = try await loadProviderValue { completion in
      provider.loadItem(
        forTypeIdentifier: UTType.propertyList.identifier,
        options: nil
      ) { item, error in
        if let error {
          completion(.failure(error))
        } else if let item {
          completion(.success(item))
        } else {
          completion(.failure(ShareInboxError.invalidPayload))
        }
      }
      return nil
    }

    let dictionary: [String: Any]?
    if let value = item as? [String: Any] {
      dictionary = value
    } else if let data = item as? Data {
      dictionary = try? PropertyListSerialization.propertyList(
        from: data,
        options: [],
        format: nil
      ) as? [String: Any]
    } else {
      dictionary = nil
    }
    guard let dictionary else { throw ShareInboxError.invalidPayload }
    let result =
      dictionary[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any]
      ?? dictionary
    let pageURL = (result["url"] as? String).flatMap(ShareInboxSafety.normalizedWebURL)
    return SafariPage(
      title: nonEmpty(result["title"] as? String),
      url: pageURL,
      selectedText: nonEmpty(result["selectedText"] as? String)
    )
  }

  private static func loadURL(from provider: NSItemProvider) async throws -> URL {
    let item: Any? = try? await loadProviderValue { completion in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
        if let error {
          completion(.failure(error))
        } else {
          completion(.success(item))
        }
      }
      return nil
    }
    try Task.checkCancellation()
    if let url = url(from: item) { return url }
    guard provider.canLoadObject(ofClass: NSURL.self) else {
      throw ShareInboxError.invalidPayload
    }
    let object: any NSItemProviderReading = try await loadProviderValue { completion in
      provider.loadObject(ofClass: NSURL.self) { url, error in
        if let error {
          completion(.failure(error))
        } else if let url {
          completion(.success(url))
        } else {
          completion(.failure(ShareInboxError.invalidPayload))
        }
      }
    }
    guard let url = object as? NSURL else { throw ShareInboxError.invalidPayload }
    return url as URL
  }

  private static func url(from item: Any?) -> URL? {
    if let url = item as? URL { return url }
    if let url = item as? NSURL { return url as URL }
    if let value = item as? String { return URL(string: value) }
    return nil
  }

  private static func loadText(from provider: NSItemProvider) async throws -> String {
    try await loadProviderValue { completion in
      provider.loadItem(
        forTypeIdentifier: UTType.plainText.identifier,
        options: nil
      ) { item, error in
        if let error {
          completion(.failure(error))
        } else if let text = item as? String {
          completion(.success(text))
        } else if let attributed = item as? NSAttributedString {
          completion(.success(attributed.string))
        } else {
          completion(.failure(ShareInboxError.invalidPayload))
        }
      }
      return nil
    }
  }

  private static func loadImage(from provider: NSItemProvider) async throws -> SharePayloadFile {
    let suggestedName = provider.suggestedName
    let typeIdentifier = provider.registeredTypeIdentifiers.first { identifier in
      guard identifier != UTType.image.identifier, let type = UTType(identifier) else {
        return false
      }
      return type.conforms(to: .image)
    } ?? UTType.image.identifier
    do {
      return try await loadProviderValue(discard: { file in
        removeOwnedStagingFile(at: file.ownedStagingURL)
      }) { completion in
        provider.loadInPlaceFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _, error in
          if let error {
            completion(.failure(error))
            return
          }
          guard let url, url.isFileURL else {
            completion(.failure(ImageFileRepresentationUnavailable()))
            return
          }
          do {
            completion(.success(try stageImage(
              from: url,
              suggestedName: suggestedName ?? url.lastPathComponent
            )))
          } catch {
            completion(.failure(error))
          }
        }
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as ShareInboxError {
      throw error
    } catch {
      return try await loadProviderValue(discard: { file in
        removeOwnedStagingFile(at: file.ownedStagingURL)
      }) { completion in
        provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
          if let error {
            completion(.failure(error))
            return
          }
          guard let url, url.isFileURL else {
            completion(.failure(ShareInboxError.invalidPayload))
            return
          }
          do {
            completion(.success(try stageImage(
              from: url,
              suggestedName: suggestedName ?? url.lastPathComponent
            )))
          } catch {
            completion(.failure(error))
          }
        }
      }
    }
  }

  private static func loadPDF(from provider: NSItemProvider) async throws -> SharePayloadFile {
    let suggestedName = provider.suggestedName
    return try await loadProviderValue(discard: { file in
      removeOwnedStagingFile(at: file.ownedStagingURL)
    }) { completion in
      provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { url, error in
        if let error {
          completion(.failure(error))
          return
        }
        guard let url, url.isFileURL else {
          completion(.failure(ShareInboxError.invalidPayload))
          return
        }
        do {
          completion(
            .success(try stagePDF(
              from: url,
              suggestedName: suggestedName ?? url.lastPathComponent,
              declaredTypeIdentifier: UTType.pdf.identifier
            ))
          )
        } catch {
          completion(.failure(error))
        }
      }
    }
  }

  private static func loadProviderValue<Value>(
    discard: @escaping (Value) -> Void = { _ in },
    operation: (@escaping (Result<Value, Error>) -> Void) -> Progress?
  ) async throws -> Value {
    let state = ProviderLoadState<Value>(discard: discard)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        state.install(continuation)
        guard !Task.isCancelled else {
          state.cancel()
          return
        }
        let progress = operation { result in
          state.resume(with: result)
        }
        state.install(progress)
      }
    } onCancel: {
      state.cancel()
    }
  }

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

  private static func stageImage(
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

  private static func stagePDF(
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

  private static func removeStaleStagingDirectories(now: Date = .now) {
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

  private static func nonEmpty(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
          !trimmed.isEmpty
    else {
      return nil
    }
    return trimmed
  }

  private static func sanitizeTitle(_ value: String) -> String {
    String((nonEmpty(value) ?? "Shared").prefix(120))
  }

  private static func firstNonEmptyLine(_ value: String) -> String {
    value
      .split(whereSeparator: \.isNewline)
      .lazy
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty }
      .map { String($0.prefix(120)) }
      ?? "Shared text"
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
