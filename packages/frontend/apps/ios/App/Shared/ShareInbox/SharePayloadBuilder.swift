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
  private static let maxImageAttachmentBytes = 3 * 1024 * 1024
  private static let maxRemoteImageBytes = 6 * 1024 * 1024
  private static let maxTotalAttachmentBytes = 10 * 1024 * 1024
  private static let maxHTMLPayloadBytes = 768 * 1024
  private static let maxSafariContentCharacters = 250_000

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
                "[AFFiNE Share] safari js titleChars=%d url=%@ contentChars=%d descChars=%d transcriptChars=%d media=%@",
                results.title?.count ?? 0,
                results.url ?? "(nil)",
                results.content?.count ?? 0,
                results.description?.count ?? 0,
                results.transcript?.count ?? 0,
                results.mediaURL ?? "(nil)"
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
            let plain = htmlToPlainText(html)
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
        if let file = await loadPreferredFile(from: provider, existingFileCount: files.count) {
          if file.mimeType == "application/pdf" {
            if let pdfText = ShareInboxSafety.pdfPlainText(from: file.data) {
              if title == "Shared" {
                title = file.fileName
              }
              if pageContent == nil || pdfText.count > (pageContent?.count ?? 0) {
                pageContent = pdfText
              }
            } else {
              rejectedAttachmentCount += 1
              if title == "Shared" {
                title = file.fileName
              }
            }
            continue
          }

          guard file.embedInMarkdownAsImage else {
            rejectedAttachmentCount += 1
            if title == "Shared" {
              title = file.fileName
            }
            continue
          }

          // Avoid treating HTML/property-list blobs as generic shared files.
          let lowerName = file.fileName.lowercased()
          let isGenericBlob = file.mimeType == "application/octet-stream" && !lowerName.hasSuffix(".pdf")
          if (!isGenericBlob || lowerName.hasSuffix(".webarchive") || lowerName.hasSuffix(".pdf")),
             canAppend(file, to: files)
          {
            files.append(file)
            if title == "Shared" || title == (urlString.flatMap { URL(string: $0)?.host } ?? "") {
              if !file.embedInMarkdownAsImage {
                title = file.fileName
              }
            }
          } else {
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
        youtubeFiles.insert(thumb, at: 0)
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
        pageContent = pageContent?.replacingOccurrences(
          of: safariMediaURL,
          with: mediaFile.placeholder
        )
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
        continue
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

    for attachment in item.attachments {
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
          with: ShareInboxSafety.escapeMarkdownText(attachment.fileName)
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
    // Apple's sample uses loadItem forTypeIdentifier: property-list.
    // Prefer that first; only fall back to dataRepresentation if needed.
    if let item = try? await loadPropertyListItem(from: provider),
       let parsed = parseSafariJavaScriptResults(from: item),
       parsed.hasUsefulPayload
    {
      return parsed
    }

    if let data = try? await loadDataRepresentation(
      from: provider,
      typeIdentifier: UTType.propertyList.identifier,
      maxBytes: maxHTMLPayloadBytes
    ),
      let parsed = parseSafariJavaScriptResults(from: data),
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
      title: results["title"] as? String,
      url: results["url"] as? String ?? results["baseURI"] as? String,
      content: content,
      description: results["description"] as? String,
      transcript: results["transcript"] as? String,
      mediaURL: results["mediaURL"] as? String,
      sourceType: results["sourceType"] as? String
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

  private static func loadDataRepresentation(
    from provider: NSItemProvider,
    typeIdentifier: String,
    maxBytes: Int
  ) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let data, data.count <= maxBytes {
          continuation.resume(returning: data)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadPropertyListItem(from provider: NSItemProvider) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let data = item as? Data, data.count > maxHTMLPayloadBytes {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        } else if let string = item as? String, string.utf8.count > maxHTMLPayloadBytes {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        } else if let item {
          continuation.resume(returning: item)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadHTMLString(from provider: NSItemProvider) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.html.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let string = item as? String, string.utf8.count <= maxHTMLPayloadBytes {
          continuation.resume(returning: string)
        } else if let data = item as? Data,
                  data.count <= maxHTMLPayloadBytes,
                  let string = String(data: data, encoding: .utf8)
                    ?? String(data: data, encoding: .utf16)
        {
          continuation.resume(returning: string)
        } else if let attributed = item as? NSAttributedString {
          let string = attributed.string
          guard string.utf8.count <= maxHTMLPayloadBytes else {
            continuation.resume(throwing: ShareInboxError.invalidPayload)
            return
          }
          continuation.resume(returning: string)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func htmlToPlainText(_ html: String) -> String {
    ShareInboxSafety.decodeXMLEntitiesOnce(
      ShareInboxSafety.stripCaptionMarkup(html)
    )
      .replacingOccurrences(of: "\u{00a0}", with: " ")
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .prefix(maxSafariContentCharacters)
      .description
  }

  private static func loadPreferredFile(
    from provider: NSItemProvider,
    existingFileCount: Int
  ) async -> SharePayloadFile? {
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
           let data = dataIfWithinLimit(at: fileURL, maxBytes: maxAttachmentBytes)
        {
          let fileName = fileURL.lastPathComponent
          let mime = mimeType(forFileName: fileName)
          let embedImage = mime.hasPrefix("image/")
          let finalData: Data
          let finalMime: String
          let finalFileName: String
          if embedImage, data.count > maxImageAttachmentBytes {
            guard let compressed = compressedImageData(from: data, maxBytes: maxImageAttachmentBytes)
            else {
              continue
            }
            finalData = compressed
            finalMime = "image/jpeg"
            finalFileName = (fileName as NSString).deletingPathExtension + ".jpg"
          } else {
            finalData = data
            finalMime = mime
            finalFileName = fileName
          }
          return SharePayloadFile(
            data: finalData,
            mimeType: finalMime,
            fileName: finalFileName,
            placeholder: placeholder(forImage: embedImage, index: existingFileCount),
            embedInMarkdownAsImage: embedImage
          )
        }
        continue
      }

      guard let data = try? await loadData(from: provider, typeIdentifier: typeId) else {
        continue
      }

      // Skip generic data if it looks like a tiny empty payload.
      guard !data.isEmpty else { continue }

      let detectedImageMime = isImage ? ShareInboxSafety.detectRasterImageMimeType(data) : nil
      let compressedImage =
        isImage && data.count > maxImageAttachmentBytes
        ? compressedImageData(from: data, maxBytes: maxImageAttachmentBytes)
        : nil
      if isImage, data.count > maxImageAttachmentBytes, compressedImage == nil {
        continue
      }
      let finalData = compressedImage ?? data
      let mimeType = compressedImage != nil ? "image/jpeg" : detectedImageMime ?? mimeType(for: type)
      let ext = compressedImage != nil
        ? "jpg"
        : detectedImageMime.map(fileExtension(forMimeType:)) ?? fileExtension(for: type)
      let fileName: String
      if type.conforms(to: .pdf) || typeId == UTType.pdf.identifier {
        fileName = "shared.pdf"
      } else if typeId.contains("webarchive") {
        fileName = "shared.webarchive"
      } else if isImage {
        fileName = "shared.\(ext)"
      } else {
        fileName = "shared.\(ext)"
      }

      return SharePayloadFile(
        data: finalData,
        mimeType: mimeType,
        fileName: fileName,
        placeholder: placeholder(forImage: isImage, index: existingFileCount),
        embedInMarkdownAsImage: isImage
      )
    }

    return nil
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
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let string = item as? String {
          guard string.utf8.count <= maxSafariContentCharacters else {
            continuation.resume(returning: String(string.prefix(maxSafariContentCharacters)))
            return
          }
          continuation.resume(returning: string)
        } else if let data = item as? Data,
                  data.count <= maxSafariContentCharacters,
                  let string = String(data: data, encoding: .utf8)
        {
          continuation.resume(returning: string)
        } else if let attributed = item as? NSAttributedString {
          continuation.resume(returning: attributed.string)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func loadData(
    from provider: NSItemProvider,
    typeIdentifier: String
  ) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let data = item as? Data {
          guard data.count <= maxAttachmentBytes else {
            continuation.resume(throwing: ShareInboxError.invalidPayload)
            return
          }
          continuation.resume(returning: data)
        } else if let url = item as? URL,
                  let data = dataIfWithinLimit(at: url, maxBytes: maxAttachmentBytes)
        {
          continuation.resume(returning: data)
        } else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.82) {
          guard data.count <= maxAttachmentBytes else {
            continuation.resume(throwing: ShareInboxError.invalidPayload)
            return
          }
          continuation.resume(returning: data)
        } else {
          continuation.resume(throwing: ShareInboxError.invalidPayload)
        }
      }
    }
  }

  private static func mimeType(for type: UTType) -> String {
    if type.conforms(to: .pdf) { return "application/pdf" }
    if type.identifier.contains("webarchive") { return "application/x-webarchive" }
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

  private static func fileExtension(forMimeType mimeType: String) -> String {
    switch mimeType.lowercased() {
    case "image/png": return "png"
    case "image/webp": return "webp"
    case "image/gif": return "gif"
    case "image/heic": return "heic"
    default: return "jpg"
    }
  }

  private static func placeholder(forImage isImage: Bool, index: Int) -> String {
    let suffix = index == 0 ? "" : "-\(index + 1)"
    return isImage ? "attachment://shared-image\(suffix)" : "attachment://shared-file\(suffix)"
  }

  private static func compressedImageData(from data: Data, maxBytes: Int) -> Data? {
    guard let image = UIImage(data: data) else { return nil }
    let maxDimension: CGFloat = 1800
    let size = image.size
    let scale = min(1, maxDimension / max(size.width, size.height))
    let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    let resized = renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: targetSize))
    }
    for quality in [0.82, 0.72, 0.62, 0.52] {
      if let jpeg = resized.jpegData(compressionQuality: quality), jpeg.count <= maxBytes {
        return jpeg
      }
    }
    guard let jpeg = resized.jpegData(compressionQuality: 0.45), jpeg.count <= maxBytes else {
      return nil
    }
    return jpeg
  }

  private static func dataIfWithinLimit(at url: URL, maxBytes: Int) -> Data? {
    guard url.isFileURL else { return nil }
    if let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
       let fileSize = values.fileSize,
       fileSize > maxBytes
    {
      return nil
    }
    guard let data = try? Data(contentsOf: url), data.count <= maxBytes else {
      return nil
    }
    return data
  }
}
