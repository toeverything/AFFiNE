import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
  private static let maxImageBytes = 12 * 1024 * 1024
  private static let maxPDFBytes = 8 * 1024 * 1024
  private static let maxTextCharacters = 250_000

  static func build(
    from extensionItems: [NSExtensionItem],
    remotePDFSession: URLSession = .shared,
    remotePDFTimeout: TimeInterval = 6
  ) async -> SharePayloadDraft {
    var title = "Shared"
    var url: String?
    var text: String?
    var fallbackText: String?
    var capturedPreview: ShareLinkPreview?
    var file: SharePayloadFile?
    var imageProviderCount = 0

    for item in extensionItems {
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier),
           let page = try? await loadSafariPage(from: provider)
        {
          title = page.title ?? title
          url = page.url ?? url
          if let pageText = page.importableText {
            text = String(pageText.prefix(maxTextCharacters))
          }
          if let pagePreview = page.linkPreview {
            capturedPreview = pagePreview
          }
        }

        if url == nil,
           provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let loadedURL = try? await loadURL(from: provider),
           let normalized = ShareInboxSafety.normalizedWebURL(loadedURL.absoluteString)
        {
          url = normalized
          if title == "Shared" {
            title = loadedURL.host ?? normalized
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

        if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier),
           let pdf = try? await loadPDFText(from: provider)
        {
          if title == "Shared" {
            title = pdf.title
          }
          text = pdf.text
          url = nil
          file = nil
          continue
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          imageProviderCount += 1
          if imageProviderCount > 1 {
            return failure(title: title, message: "Share one image at a time.")
          }
          do {
            file = try await loadImage(from: provider)
          } catch ShareInboxError.payloadTooLarge {
            return failure(title: title, message: "The image must be smaller than 12 MB.")
          } catch {
            return failure(title: title, message: "This image format is not supported.")
          }
        }
      }

      if let attributedText = nonEmpty(item.attributedContentText?.string),
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
    if let remoteURL = url,
       text == nil,
       looksLikePDFURL(remoteURL),
       let pdf = try? await loadRemotePDFText(
         from: remoteURL,
         session: remotePDFSession,
         timeout: remotePDFTimeout
       )
    {
      title = title == "Shared" ? pdf.title : title
      text = pdf.text
      url = nil
    }
    if title == "Shared" {
      if let file {
        title = (file.fileName as NSString).deletingPathExtension
      } else if let url, let host = URL(string: url)?.host {
        title = host
      } else if let fallbackText {
        title = firstNonEmptyLine(fallbackText)
      }
    }

    let content: ShareInboxContent?
    if file != nil {
      content = ShareInboxContent(kind: .image, url: url, text: text)
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
        message: "AFFiNE can currently save links, text, or one image."
      )
    }

    let preview = text ?? url ?? file?.fileName ?? "Shared content"
    return SharePayloadDraft(
      title: sanitizeTitle(title),
      content: content,
      previewText: String(preview.prefix(280)),
      preview: capturedPreview,
      file: file,
      errorMessage: nil
    )
  }

  private static func failure(title: String, message: String) -> SharePayloadDraft {
    SharePayloadDraft(
      title: sanitizeTitle(title),
      content: nil,
      previewText: "",
      preview: nil,
      file: nil,
      errorMessage: message
    )
  }

  private struct SafariPage {
    var title: String?
    var url: String?
    var selectedText: String?
    var content: String?
    var pageDescription: String?
    var transcript: String?
    var thumbnailURL: String?

    var importableText: String? {
      let parts = [selectedText, pageDescription, content]
        .compactMap(nonEmpty)
      guard !parts.isEmpty else { return nil }
      return parts.joined(separator: "\n\n")
    }

    var linkPreview: ShareLinkPreview? {
      guard let url else { return nil }
      var preview = ShareLinkPreview(
        url: url,
        title: title,
        siteName: nil,
        description: pageDescription,
        images: thumbnailURL.map { [$0] },
        favicons: nil,
        mediaType: nil,
        provider: Self.isYouTubeURL(url) ? "youtube" : nil,
        author: nil,
        publishedAt: nil,
        durationSeconds: nil,
        transcript: transcript.flatMap(Self.transcript(from:))
      )
      if preview.provider == nil,
         let host = URL(string: url)?.host?.lowercased(),
         host == "x.com" || host == "www.x.com" || host == "twitter.com" || host == "www.twitter.com"
      {
        preview.provider = "x"
      }
      return preview
    }

    private static func transcript(from value: String) -> ShareLinkPreview.Transcript? {
      let segments = value
        .split(whereSeparator: \.isNewline)
        .compactMap { line -> ShareLinkPreview.Transcript.Segment? in
          let value = line.trimmingCharacters(in: .whitespacesAndNewlines)
          guard let match = value.range(
            of: #"^(\d{1,2}:)?\d{1,2}:\d{2}\s+"#,
            options: .regularExpression
          ) else { return nil }
          let timestamp = String(value[match]).trimmingCharacters(in: .whitespacesAndNewlines)
          let text = String(value[match.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
          guard !text.isEmpty else { return nil }
          return .init(text: text, startSeconds: seconds(from: timestamp), durationSeconds: nil, speaker: nil)
        }
      guard !segments.isEmpty else { return nil }
      return .init(language: nil, segments: segments, chapters: nil, truncated: nil)
    }

    private static func seconds(from value: String) -> Double {
      let parts = value.split(separator: ":").compactMap { Double($0) }
      if parts.count == 3 { return parts[0] * 3600 + parts[1] * 60 + parts[2] }
      if parts.count == 2 { return parts[0] * 60 + parts[1] }
      return parts.first ?? 0
    }

    private static func isYouTubeURL(_ value: String) -> Bool {
      guard let host = URL(string: value)?.host?.lowercased() else { return false }
      return host == "youtu.be" || host.hasSuffix(".youtube.com") || host == "youtube.com"
    }
  }

  private static func loadSafariPage(from provider: NSItemProvider) async throws -> SafariPage {
    let item: Any = try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(
        forTypeIdentifier: UTType.propertyList.identifier,
        options: nil
      ) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let item {
          continuation.resume(returning: item)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
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
      selectedText: nonEmpty(result["selectedText"] as? String),
      content: nonEmpty(
        result["content"] as? String
          ?? result["body"] as? String
          ?? result["text"] as? String
      ),
      pageDescription: nonEmpty(result["description"] as? String),
      transcript: nonEmpty(result["transcript"] as? String),
      thumbnailURL: (result["thumbnailURL"] as? String).flatMap(ShareInboxSafety.normalizedWebURL)
    )
  }

  private static func loadURL(from provider: NSItemProvider) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let url = item as? URL {
          continuation.resume(returning: url)
        } else if let value = item as? String, let url = URL(string: value) {
          continuation.resume(returning: url)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadText(from provider: NSItemProvider) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(
        forTypeIdentifier: UTType.plainText.identifier,
        options: nil
      ) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let text = item as? String {
          continuation.resume(returning: text)
        } else if let attributed = item as? NSAttributedString {
          continuation.resume(returning: attributed.string)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadImage(from provider: NSItemProvider) async throws -> SharePayloadFile {
    let item: Any = try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let item {
          continuation.resume(returning: item)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }

    let data: Data
    let suggestedName: String?
    if let value = item as? Data {
      data = value
      suggestedName = provider.suggestedName
    } else if let url = item as? URL, url.isFileURL {
      let values = try url.resourceValues(forKeys: [.fileSizeKey])
      if let fileSize = values.fileSize, fileSize > maxImageBytes {
        throw ShareInboxError.payloadTooLarge
      }
      data = try Data(contentsOf: url, options: .mappedIfSafe)
      suggestedName = url.lastPathComponent
    } else if let image = item as? UIImage, let jpeg = image.jpegData(compressionQuality: 0.9) {
      data = jpeg
      suggestedName = provider.suggestedName
    } else {
      throw ShareInboxError.invalidPayload
    }

    guard data.count <= maxImageBytes else { throw ShareInboxError.payloadTooLarge }
    guard let mimeType = ShareInboxSafety.detectRasterImageMimeType(data) else {
      throw ShareInboxError.invalidPayload
    }
    let fileExtension = fileExtension(for: mimeType)
    let baseName = nonEmpty(suggestedName)
      .map { ($0 as NSString).lastPathComponent }
      .flatMap { nonEmpty(($0 as NSString).deletingPathExtension) }
      ?? "shared-image"
    return SharePayloadFile(
      data: data,
      mimeType: mimeType,
      fileName: "\(baseName).\(fileExtension)"
    )
  }

  private struct PDFText {
    var title: String
    var text: String
  }

  private static func loadPDFText(from provider: NSItemProvider) async throws -> PDFText {
    let item: Any = try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.pdf.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let item {
          continuation.resume(returning: item)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }

    let data: Data
    let title: String
    if let value = item as? Data {
      data = value
      title = pdfTitle(from: provider.suggestedName)
    } else if let url = item as? URL, url.isFileURL {
      let values = try url.resourceValues(forKeys: [.fileSizeKey])
      if let fileSize = values.fileSize, fileSize > maxPDFBytes {
        throw ShareInboxError.payloadTooLarge
      }
      data = try Data(contentsOf: url, options: .mappedIfSafe)
      title = pdfTitle(from: url.lastPathComponent)
    } else {
      throw ShareInboxError.invalidPayload
    }
    guard data.count <= maxPDFBytes else { throw ShareInboxError.payloadTooLarge }
    return try PDFText(title: title, text: extractPDFText(from: data))
  }

  private static func loadRemotePDFText(
    from value: String,
    session: URLSession,
    timeout: TimeInterval
  ) async throws -> PDFText {
    guard let normalized = ShareInboxSafety.normalizedWebURL(value),
          let url = URL(string: normalized)
    else {
      throw ShareInboxError.invalidPayload
    }
    let request: URLRequest = {
      var request = URLRequest(url: url)
      request.timeoutInterval = timeout
      return request
    }()
    let (data, response) = try await withTimeout(seconds: timeout) {
      try await loadRemoteData(session: session, request: request, maxBytes: maxPDFBytes)
    }
    guard let http = response as? HTTPURLResponse,
          (200..<300).contains(http.statusCode)
    else {
      throw ShareInboxError.invalidPayload
    }
    if let mime = http.value(forHTTPHeaderField: "Content-Type")?.lowercased(),
       !mime.contains("application/pdf"),
       !url.pathExtension.lowercased().contains("pdf")
    {
      throw ShareInboxError.invalidPayload
    }
    return try PDFText(title: pdfTitle(from: url.lastPathComponent), text: extractPDFText(from: data))
  }

  private static func loadRemoteData(
    session: URLSession,
    request: URLRequest,
    maxBytes: Int
  ) async throws -> (Data, URLResponse) {
    let (bytes, response) = try await session.bytes(for: request)
    var data = Data()
    for try await byte in bytes {
      data.append(byte)
      if data.count > maxBytes {
        throw ShareInboxError.payloadTooLarge
      }
    }
    return (data, response)
  }

  private static func withTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @escaping @Sendable () async throws -> T
  ) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
      group.addTask {
        try await operation()
      }
      group.addTask {
        let nanoseconds = UInt64(max(0.1, seconds) * 1_000_000_000)
        try await Task.sleep(nanoseconds: nanoseconds)
        throw URLError(.timedOut)
      }
      let result = try await group.next()!
      group.cancelAll()
      return result
    }
  }

  private static func extractPDFText(from data: Data) throws -> String {
    guard let document = PDFDocument(data: data) else {
      throw ShareInboxError.invalidPayload
    }
    let text = (0..<document.pageCount)
      .compactMap { document.page(at: $0)?.string }
      .joined(separator: "\n\n")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { throw ShareInboxError.invalidPayload }
    return String(text.prefix(maxTextCharacters))
  }

  private static func looksLikePDFURL(_ value: String) -> Bool {
    URL(string: value)?.pathExtension.lowercased() == "pdf"
  }

  private static func pdfTitle(from value: String?) -> String {
    nonEmpty(value)
      .map { ($0 as NSString).lastPathComponent }
      .flatMap { nonEmpty(($0 as NSString).deletingPathExtension) }
      ?? "Shared PDF"
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
