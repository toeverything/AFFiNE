//
//  SharePayloadBuilder.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation
import UIKit
import UniformTypeIdentifiers

private final class XMediaRedirectDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let url = request.url, ShareInboxSafety.isAllowedXMediaURL(url) else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
}

enum SharePayloadBuilder {
  private static let maxAttachmentBytes = 12 * 1024 * 1024
  private static let maxRemoteImageBytes = 6 * 1024 * 1024
  private static let maxTotalAttachmentBytes = 24 * 1024 * 1024
  private static let maxTextPayloadBytes = 512 * 1024
  private static let maxHTMLPayloadBytes = 768 * 1024
  private static let maxPropertyListPayloadBytes = 1024 * 1024
  private static let maxSafariContentCharacters = 250_000
  private static let maxSafariTranscriptCharacters = 120_000

  private struct FileLoadResult {
    var file: SharePayloadFile?
    var rejectedAttachmentCount: Int
  }

  static func build(
    from extensionItems: [NSExtensionItem],
    enrichYouTube: Bool = true
  ) async -> SharePayloadDraft {
    var title = "Shared"
    var urlString: String?
    var textBody: String?
    var pageContent: String?
    var safariDescription: String?
    var safariTranscript: String?
    var safariMediaURL: String?
    var safariSourceType: String?
    var files: [SharePayloadFile] = []
    var rejectedAttachmentCount = 0

    for item in extensionItems {
      let attachments = item.attachments ?? []
      for provider in attachments {
        let typeIds = Set(provider.registeredTypeIdentifiers)
        #if DEBUG
          NSLog(
            "[AFFiNE Share] provider types=%@",
            typeIds.sorted().joined(separator: ",")
          )
        #endif

        // Safari JS preprocessing results (title / url / page body).
        // Try whenever the provider claims property-list support.
        if typeIds.contains(UTType.propertyList.identifier)
          || provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier)
        {
          if let results = try? await loadSafariJavaScriptResults(from: provider) {
            if let safariTitle = results.title, !safariTitle.isEmpty {
              title = safariTitle
            }
            if let safariURL = results.url, !safariURL.isEmpty {
              urlString = safariURL
            }
            if let content = results.content {
              let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
              // Accept any meaningful page body; do not require a large minimum.
              if trimmed.count >= 1, pageContent == nil || trimmed.count > (pageContent?.count ?? 0) {
                pageContent = trimmed
              }
            }
            if let description = results.description {
              let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
              if !trimmed.isEmpty {
                safariDescription = trimmed
                if pageContent == nil || trimmed.count > (pageContent?.count ?? 0) {
                  pageContent = trimmed
                }
              }
            }
            if let transcript = results.transcript {
              let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
              if !trimmed.isEmpty {
                safariTranscript = trimmed
              }
            }
            if let mediaURL = results.mediaURL {
              let trimmed = mediaURL.trimmingCharacters(in: .whitespacesAndNewlines)
              if !trimmed.isEmpty {
                safariMediaURL = trimmed
              }
            }
            if let sourceType = results.sourceType {
              let trimmed = sourceType.trimmingCharacters(in: .whitespacesAndNewlines)
              if !trimmed.isEmpty {
                safariSourceType = trimmed
              }
            }
            #if DEBUG
              NSLog(
                "[AFFiNE Share] safari js titleChars=%d hasURL=%d contentChars=%d descChars=%d transcriptChars=%d hasMedia=%d",
                results.title?.count ?? 0,
                results.url == nil ? 0 : 1,
                results.content?.count ?? 0,
                results.description?.count ?? 0,
                results.transcript?.count ?? 0,
                results.mediaURL == nil ? 0 : 1
              )
            #endif
          }
        }

        // Safari PDF/webpage shares often include both a remote URL and a file payload.
        if urlString == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          if let url = try? await loadURL(from: provider, typeIdentifier: UTType.url.identifier) {
            // Prefer remote http(s) links over local file URLs here.
            if !url.isFileURL {
              urlString = url.absoluteString
              if title == "Shared" {
                title = url.host ?? url.absoluteString
              }
            }
          }
        }

        // public.html fallback when JS preprocessing is unavailable.
        if safariSourceType == nil,
           provider.hasItemConformingToTypeIdentifier(UTType.html.identifier)
        {
          if let html = try? await loadHTMLString(from: provider) {
            let plain = await htmlToPlainText(html)
            if plain.count > (pageContent?.count ?? 0) {
              pageContent = plain
            }
          }
        }

        if textBody == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          if let text = try? await loadString(from: provider), !text.isEmpty {
            textBody = text
            if title == "Shared" {
              title = String(text.prefix(48))
            }
          }
        }

        // Prefer PDF / webarchive / image file payloads even when a URL is also present.
        // Share sheets can provide multiple photos/files in one action; keep each one.
        let fileResult = await loadPreferredFile(from: provider)
        rejectedAttachmentCount += fileResult.rejectedAttachmentCount
        if let file = fileResult.file {
          // Avoid treating HTML/property-list blobs as generic shared files.
          let lowerName = file.fileName.lowercased()
          let isGenericBlob = file.mimeType == "application/octet-stream" && !lowerName.hasSuffix(".pdf")
          if file.embedInMarkdownAsImage {
            let indexedFile = file.withUniquePlaceholder(index: files.count)
            if canAppend(indexedFile, to: files) {
              files.append(indexedFile)
              if title == "Shared" || title == (urlString.flatMap { URL(string: $0)?.host } ?? "") {
                title = indexedFile.fileName
              }
            } else {
              rejectedAttachmentCount += 1
            }
          } else if isGenericBlob, !lowerName.hasSuffix(".webarchive"), !lowerName.hasSuffix(".pdf") {
            rejectedAttachmentCount += 1
          } else {
            // Non-image attachments are not importable yet. Keep URL/page/text content,
            // but count the skipped file so file-only shares do not become fake successes.
            rejectedAttachmentCount += 1
          }
        }
      }

      if let suggested = item.attributedContentText?.string, !suggested.isEmpty {
        if let attributedBody = ShareInboxSafety.attributedTextBody(
          suggested,
          hasAttachments: !attachments.isEmpty,
          existingText: textBody
        ) {
          textBody = attributedBody
        }
        if title == "Shared" {
          title = String(suggested.prefix(48))
        }
      }
    }

    // YouTube: replace noisy mobile DOM with thumbnail + description + transcript.
    // Caller may defer enrichYouTube briefly so Safari JS can finish async caption fetch.
    if enrichYouTube,
       let urlString, YouTubeShareEnricher.isYouTubeURL(urlString),
       let enriched = await YouTubeShareEnricher.enrich(
         urlString: urlString,
         seed: .init(
           title: title == "Shared" ? nil : title,
           description: safariDescription,
           transcriptMarkdown: safariTranscript
         )
       )
    {
      var youtubeFiles = files
      if let thumb = YouTubeShareEnricher.thumbnailFile(from: enriched) {
        youtubeFiles.removeAll { $0.placeholder == thumb.placeholder }
        if canAppend(thumb, to: youtubeFiles) {
          youtubeFiles.insert(thumb, at: 0)
        }
      }
      let markdown = YouTubeShareEnricher.buildMarkdown(from: enriched)
      let previewSeed =
        enriched.description.isEmpty
        ? enriched.transcriptMarkdown
        : enriched.description
      #if DEBUG
        NSLog(
          "[AFFiNE Share] youtube enrich titleChars=%d descChars=%d transcriptChars=%d thumb=%d",
          enriched.title.count,
          enriched.description.count,
          enriched.transcriptMarkdown.count,
          enriched.thumbnailData?.count ?? 0
        )
      #endif
      return SharePayloadDraft(
        title: sanitizeTitle(enriched.title.isEmpty ? title : enriched.title),
        markdown: markdown,
        previewText: String(previewSeed.prefix(280)),
        files: youtubeFiles,
        rejectedAttachmentCount: rejectedAttachmentCount
      )
    }

    if safariSourceType == "x-post",
       let safariMediaURL,
       let mediaFile = await loadRemoteImageFile(
         from: safariMediaURL,
         placeholder: "attachment://x-post-media",
         fileNamePrefix: "x-post-media"
       )
    {
      files.removeAll { $0.placeholder == mediaFile.placeholder }
      if canAppend(mediaFile, to: files) {
        files.insert(mediaFile, at: 0)
      }
    }

    // Prefer full page body over short share-sheet title text.
    let body: String?
    if let pageContent, !pageContent.isEmpty {
      body = ShareInboxSafety.escapeMarkdownText(pageContent)
    } else {
      body = ShareInboxSafety.importablePlainText(
        textBody,
        excludingURL: urlString
      )
    }

    var markdownParts: [String] = []
    if let urlString {
      if let safeURL = ShareInboxSafety.safeMarkdownWebURL(urlString) {
        markdownParts.append("[Source](\(safeURL))")
      } else {
        markdownParts.append(
          "Source: \(ShareInboxSafety.escapeMarkdownText(urlString))"
        )
      }
    }
    if let body {
      markdownParts.append(body)
    } else if let urlString {
      // Keep a visible editable body even when only the link is available.
      markdownParts.append(ShareInboxSafety.escapeMarkdownText(urlString))
    }
    for file in files {
      let alreadyReferenced = markdownParts.contains { $0.contains(file.placeholder) }
      if file.embedInMarkdownAsImage {
        if !alreadyReferenced {
          markdownParts.append("![Shared Image](\(file.placeholder))")
        }
      } else {
        markdownParts.append(
          "Shared file: \(ShareInboxSafety.escapeMarkdownText(file.fileName))"
        )
        markdownParts.append(
          "(\(ShareInboxSafety.escapeMarkdownText(file.mimeType)))"
        )
      }
    }

    let markdown = markdownParts
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: "\n\n")

    let preview: String
    if let body, !body.isEmpty {
      preview = body
    } else if !markdown.isEmpty {
      preview = markdown
    } else if let urlString {
      preview = urlString
    } else if let textBody {
      preview = textBody
    } else if let file = files.first {
      preview = file.fileName
    } else {
      preview = "Shared content"
    }

    return SharePayloadDraft(
      title: sanitizeTitle(title),
      markdown: markdown,
      previewText: String(preview.prefix(280)),
      files: files,
      rejectedAttachmentCount: rejectedAttachmentCount
    )
  }

  static func resolveMarkdown(
    item: ShareInboxItem,
    store: ShareInboxStore = .shared
  ) -> String {
    var markdown = item.markdown

    for attachment in item.attachments.sorted(by: { $0.placeholder.count > $1.placeholder.count }) {
      guard markdown.contains(attachment.placeholder),
            let url = store.attachmentURL(for: attachment),
            let data = try? Data(contentsOf: url)
      else {
        continue
      }

      let isImage = attachment.mimeType.hasPrefix("image/")
      if isImage {
        let base64 = data.base64EncodedString()
        let dataURI = "data:\(attachment.mimeType);base64,\(base64)"
        markdown = markdown.replacingOccurrences(of: attachment.placeholder, with: dataURI)
      } else {
        // Keep a readable note; binary PDF/webarchive is not inlined into markdown.
        markdown = markdown.replacingOccurrences(
          of: attachment.placeholder,
          with: attachment.fileName
        )
      }
    }

    return markdown.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private struct SafariJavaScriptResults {
    var title: String?
    var url: String?
    var content: String?
    var description: String?
    var transcript: String?
    var mediaURL: String?
    var sourceType: String?

    var hasUsefulPayload: Bool {
      let titleOK = !(title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      let urlOK = !(url?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      let contentOK = !(content?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      let descriptionOK = !(description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      let transcriptOK = !(transcript?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      let mediaOK = !(mediaURL?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
      return titleOK || urlOK || contentOK || descriptionOK || transcriptOK || mediaOK
    }
  }

  private static func loadSafariJavaScriptResults(
    from provider: NSItemProvider
  ) async throws -> SafariJavaScriptResults {
    let data = try await loadFileRepresentationData(
      from: provider,
      typeIdentifier: UTType.propertyList.identifier,
      maxBytes: maxPropertyListPayloadBytes
    ).data
    if let parsed = parseSafariJavaScriptResults(from: data),
       parsed.hasUsefulPayload
    {
      return parsed
    }
    throw ShareInboxError.invalidPayload
  }

  private static func parseSafariJavaScriptResults(from item: Any) -> SafariJavaScriptResults? {
    guard let dictionary = dictionary(from: item) else { return nil }
    let results =
      dictionary[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any]
      ?? dictionary

    // Some hosts may use alternate keys; keep title/url/content as primary.
    let content =
      (results["content"] as? String)
      ?? (results["body"] as? String)
      ?? (results["text"] as? String)

    return SafariJavaScriptResults(
      title: limitedString(results["title"] as? String, maxCharacters: 512),
      url: limitedString(results["url"] as? String ?? results["baseURI"] as? String, maxCharacters: 4096),
      content: limitedString(content, maxCharacters: maxSafariContentCharacters),
      description: limitedString(results["description"] as? String, maxCharacters: maxSafariContentCharacters),
      transcript: limitedString(results["transcript"] as? String, maxCharacters: maxSafariTranscriptCharacters),
      mediaURL: limitedString(results["mediaURL"] as? String, maxCharacters: 4096),
      sourceType: limitedString(results["sourceType"] as? String, maxCharacters: 128)
    )
  }

  private static func dictionary(from item: Any) -> [String: Any]? {
    if let dictionary = item as? [String: Any] {
      return dictionary
    }
    if let nested = item as? NSDictionary {
      var dictionary: [String: Any] = [:]
      for (key, value) in nested {
        if let key = key as? String {
          dictionary[key] = value
        }
      }
      return dictionary
    }
    if let data = item as? Data,
       data.count <= maxPropertyListPayloadBytes,
       let plist = try? PropertyListSerialization.propertyList(
         from: data,
         options: [],
         format: nil
       ) as? [String: Any]
    {
      return plist
    }
    return nil
  }

  private static func loadHTMLString(from provider: NSItemProvider) async throws -> String {
    try await loadFileRepresentationString(
      from: provider,
      typeIdentifier: UTType.html.identifier,
      maxBytes: maxHTMLPayloadBytes,
      maxCharacters: maxSafariContentCharacters,
      encodings: [.utf8, .utf16]
    )
  }

  @MainActor
  private static func htmlToPlainText(_ html: String) -> String {
    guard html.utf8.count <= maxHTMLPayloadBytes else {
      return String(
        ShareInboxSafety.decodeXMLEntitiesOnce(
          ShareInboxSafety.stripCaptionMarkup(html)
        ).prefix(maxSafariContentCharacters)
      )
    }
    guard let data = html.data(using: .utf8) else {
      return ShareInboxSafety.stripCaptionMarkup(html)
    }
    let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
      .documentType: NSAttributedString.DocumentType.html,
      .characterEncoding: String.Encoding.utf8.rawValue,
    ]
    guard let attributed = try? NSAttributedString(
      data: data,
      options: options,
      documentAttributes: nil
    ) else {
      return ShareInboxSafety.decodeXMLEntitiesOnce(
        ShareInboxSafety.stripCaptionMarkup(html)
      )
    }
    return attributed.string
      .replacingOccurrences(of: "\u{00a0}", with: " ")
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func loadPreferredFile(from provider: NSItemProvider) async -> FileLoadResult {
    let candidates: [(UTType, Bool)] = [
      (UTType.pdf, false),
      (UTType(filenameExtension: "webarchive") ?? UTType.data, false),
      (.jpeg, true),
      (.png, true),
      (.heic, true),
      (.webP, true),
      (.image, true),
      (.fileURL, false),
    ]

    for (type, isImage) in candidates {
      let typeId = type.identifier
      guard provider.hasItemConformingToTypeIdentifier(typeId) else { continue }

      if type.conforms(to: .fileURL) || typeId == UTType.fileURL.identifier {
        if let fileURL = try? await loadURL(from: provider, typeIdentifier: typeId),
           fileURL.isFileURL,
           let payload = dataIfWithinLimit(at: fileURL, maxBytes: maxAttachmentBytes)
        {
          if payload.rejectedDueToSize {
            return FileLoadResult(file: nil, rejectedAttachmentCount: 1)
          }
          let data = payload.data
          let fileName = fileURL.lastPathComponent
          let mime = mimeType(forFileName: fileName)
          let embedImage = mime.hasPrefix("image/")
          return FileLoadResult(file: SharePayloadFile(
            data: data,
            mimeType: mime,
            fileName: fileName,
            placeholder: embedImage ? "attachment://shared-image" : "attachment://shared-file",
            embedInMarkdownAsImage: embedImage
          ), rejectedAttachmentCount: 0)
        } else if provider.hasItemConformingToTypeIdentifier(typeId) {
          return FileLoadResult(file: nil, rejectedAttachmentCount: 1)
        }
        continue
      }

      let payload: (data: Data, rejectedDueToSize: Bool)
      do {
        payload = try await loadData(from: provider, typeIdentifier: typeId)
      } catch {
        return FileLoadResult(file: nil, rejectedAttachmentCount: 1)
      }
      if payload.rejectedDueToSize {
        return FileLoadResult(file: nil, rejectedAttachmentCount: 1)
      }
      let data = payload.data

      // Skip generic data if it looks like a tiny empty payload.
      guard !data.isEmpty else { continue }

      let ext = fileExtension(for: type)
      let mime = mimeType(for: type, data: data)
      let fileName: String
      if type.conforms(to: .pdf) || typeId == UTType.pdf.identifier {
        fileName = "shared.pdf"
      } else if typeId.contains("webarchive") {
        fileName = "shared.webarchive"
      } else if isImage {
        fileName = "shared.\(fileExtension(forMimeType: mime, fallback: ext))"
      } else {
        fileName = "shared.\(ext)"
      }

      return FileLoadResult(file: SharePayloadFile(
        data: data,
        mimeType: mime,
        fileName: fileName,
        placeholder: isImage ? "attachment://shared-image" : "attachment://shared-file",
        embedInMarkdownAsImage: isImage
      ), rejectedAttachmentCount: 0)
    }

    return FileLoadResult(file: nil, rejectedAttachmentCount: 0)
  }

  private static func loadRemoteImageFile(
    from urlString: String,
    placeholder: String,
    fileNamePrefix: String
  ) async -> SharePayloadFile? {
    guard let url = URL(string: urlString),
          ShareInboxSafety.isAllowedXMediaURL(url)
    else {
      return nil
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 10
    request.setValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      forHTTPHeaderField: "User-Agent"
    )
    do {
      let redirectDelegate = XMediaRedirectDelegate()
      let (data, response) = try await fetchDataCapped(
        request: request,
        maxBytes: maxRemoteImageBytes,
        delegate: redirectDelegate
      )
      guard !data.isEmpty,
            let http = response as? HTTPURLResponse,
            (200...299).contains(http.statusCode),
            let responseURL = http.url,
            ShareInboxSafety.isAllowedXMediaURL(responseURL)
      else {
        return nil
      }
      let declaredMimeType = http.value(forHTTPHeaderField: "Content-Type")?
        .components(separatedBy: ";")
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        ?? mimeType(forFileName: url.lastPathComponent)
      guard ShareInboxSafety.isSupportedRasterImageMimeType(declaredMimeType),
            let mimeType = ShareInboxSafety.detectRasterImageMimeType(data)
      else {
        return nil
      }
      let ext = fileExtension(forMimeType: mimeType)
      return SharePayloadFile(
        data: data,
        mimeType: mimeType,
        fileName: "\(fileNamePrefix).\(ext)",
        placeholder: placeholder,
        embedInMarkdownAsImage: true
      )
    } catch {
      return nil
    }
  }

  static func fetchDataCapped(
    request: URLRequest,
    maxBytes: Int,
    delegate: URLSessionTaskDelegate? = nil
  ) async throws -> (Data, URLResponse) {
    let (bytes, response) = try await URLSession.shared.bytes(
      for: request,
      delegate: delegate
    )
    let expectedLength = response.expectedContentLength
    if expectedLength >= 0, expectedLength > Int64(maxBytes) {
      throw ShareInboxError.invalidPayload
    }

    var data = Data()
    data.reserveCapacity(min(maxBytes, 256 * 1024))
    for try await byte in bytes {
      data.append(byte)
      if data.count > maxBytes {
        throw ShareInboxError.invalidPayload
      }
    }
    return (data, response)
  }

  private static func sanitizeTitle(_ title: String) -> String {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Shared" }
    return String(trimmed.prefix(120))
  }

  private static func limitedString(_ value: String?, maxCharacters: Int) -> String? {
    guard let value else { return nil }
    return String(value.prefix(maxCharacters))
  }

  private static func canAppend(_ file: SharePayloadFile, to files: [SharePayloadFile]) -> Bool {
    let currentBytes = files.reduce(0) { $0 + $1.data.count }
    return file.data.count <= maxAttachmentBytes
      && currentBytes + file.data.count <= maxTotalAttachmentBytes
  }

  private static func loadURL(from provider: NSItemProvider, typeIdentifier: String) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let url = item as? URL {
          continuation.resume(returning: url)
        } else if let data = item as? Data,
                  let url = URL(dataRepresentation: data, relativeTo: nil)
        {
          continuation.resume(returning: url)
        } else if let string = item as? String, let url = URL(string: string) {
          continuation.resume(returning: url)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadString(from provider: NSItemProvider) async throws -> String {
    try await loadFileRepresentationString(
      from: provider,
      typeIdentifier: UTType.plainText.identifier,
      maxBytes: maxTextPayloadBytes,
      maxCharacters: maxSafariContentCharacters,
      encodings: [.utf8]
    )
  }

  private static func loadData(
    from provider: NSItemProvider,
    typeIdentifier: String
  ) async throws -> (data: Data, rejectedDueToSize: Bool) {
    if let filePayload = try? await loadFileRepresentationData(
      from: provider,
      typeIdentifier: typeIdentifier
    ) {
      return filePayload
    }
    if let data = try? await loadDataRepresentation(from: provider, typeIdentifier: typeIdentifier) {
      return (data, data.count > maxAttachmentBytes)
    }
    return try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let data = item as? Data {
          continuation.resume(returning: (data, data.count > maxAttachmentBytes))
        } else if let url = item as? URL,
                  let payload = dataIfWithinLimit(at: url, maxBytes: maxAttachmentBytes)
        {
          continuation.resume(returning: (payload.data, payload.rejectedDueToSize))
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadFileRepresentationData(
    from provider: NSItemProvider,
    typeIdentifier: String,
    maxBytes: Int = maxAttachmentBytes
  ) async throws -> (data: Data, rejectedDueToSize: Bool) {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let url,
              let payload = dataIfWithinLimit(at: url, maxBytes: maxBytes)
        else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
          return
        }
        continuation.resume(returning: payload)
      }
    }
  }

  private static func loadFileRepresentationString(
    from provider: NSItemProvider,
    typeIdentifier: String,
    maxBytes: Int,
    maxCharacters: Int,
    encodings: [String.Encoding]
  ) async throws -> String {
    let payload = try await loadFileRepresentationData(
      from: provider,
      typeIdentifier: typeIdentifier,
      maxBytes: maxBytes
    )
    guard !payload.rejectedDueToSize,
          let string = encodings.lazy.compactMap({ String(data: payload.data, encoding: $0) }).first
    else {
      throw ShareInboxError.invalidPayload
    }
    return String(string.prefix(maxCharacters))
  }

  private static func loadDataRepresentation(
    from provider: NSItemProvider,
    typeIdentifier: String
  ) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let data {
          continuation.resume(returning: data)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func mimeType(for type: UTType, data: Data? = nil) -> String {
    if type.conforms(to: .pdf) { return "application/pdf" }
    if type.identifier.contains("webarchive") { return "application/x-webarchive" }
    if type.conforms(to: .jpeg) { return "image/jpeg" }
    if type.conforms(to: .png) { return "image/png" }
    if type.conforms(to: .heic) { return "image/heic" }
    if type.conforms(to: .webP) { return "image/webp" }
    if type.conforms(to: .image) {
      if let data {
        if data.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
        if data.starts(with: [0x52, 0x49, 0x46, 0x46]) { return "image/webp" }
      }
      return "image/jpeg"
    }
    return type.preferredMIMEType ?? "application/octet-stream"
  }

  private static func mimeType(forFileName fileName: String) -> String {
    let ext = (fileName as NSString).pathExtension.lowercased()
    switch ext {
    case "pdf": return "application/pdf"
    case "webarchive": return "application/x-webarchive"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "heic": return "image/heic"
    case "webp": return "image/webp"
    case "html", "htm": return "text/html"
    default: return "application/octet-stream"
    }
  }

  private static func fileExtension(for type: UTType) -> String {
    if type.conforms(to: .pdf) { return "pdf" }
    if type.identifier.contains("webarchive") { return "webarchive" }
    return type.preferredFilenameExtension ?? "bin"
  }

  private static func fileExtension(forMimeType mimeType: String, fallback: String = "jpg") -> String {
    switch mimeType.lowercased() {
    case "image/png": return "png"
    case "image/webp": return "webp"
    case "image/gif": return "gif"
    case "image/heic": return "heic"
    default: return fallback
    }
  }

  private static func dataIfWithinLimit(
    at url: URL,
    maxBytes: Int
  ) -> (data: Data, rejectedDueToSize: Bool)? {
    guard url.isFileURL else { return nil }
    if let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
       let fileSize = values.fileSize,
       fileSize > maxBytes
    {
      return (Data(), true)
    }
    guard let data = try? Data(contentsOf: url), data.count <= maxBytes else {
      return (Data(), true)
    }
    return (data, false)
  }
}

private extension SharePayloadFile {
  func withUniquePlaceholder(index: Int) -> SharePayloadFile {
    var copy = self
    if let url = URL(string: placeholder),
       let scheme = url.scheme,
       let host = url.host,
      url.path.isEmpty
    {
      copy.placeholder = "\(scheme)://\(host)-\(String(format: "%04d", index + 1))"
    } else {
      copy.placeholder = "\(placeholder)-\(String(format: "%04d", index + 1))"
    }
    return copy
  }
}
