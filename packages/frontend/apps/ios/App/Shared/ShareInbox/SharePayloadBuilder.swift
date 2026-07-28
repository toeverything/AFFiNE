//
//  SharePayloadBuilder.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
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

    for item in extensionItems {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        let typeIds = Set(provider.registeredTypeIdentifiers)
        NSLog(
          "[AFFiNE Share] provider types=%@",
          typeIds.sorted().joined(separator: ",")
        )

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
            NSLog(
              "[AFFiNE Share] safari js titleChars=%d url=%@ contentChars=%d descChars=%d transcriptChars=%d media=%@",
              results.title?.count ?? 0,
              results.url ?? "(nil)",
              results.content?.count ?? 0,
              results.description?.count ?? 0,
              results.transcript?.count ?? 0,
              results.mediaURL ?? "(nil)"
            )
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
        if files.isEmpty {
          if let file = await loadPreferredFile(from: provider) {
            // Avoid treating HTML/property-list blobs as generic shared files.
            let lowerName = file.fileName.lowercased()
            let isGenericBlob = file.mimeType == "application/octet-stream" && !lowerName.hasSuffix(".pdf")
            if !isGenericBlob || lowerName.hasSuffix(".webarchive") || lowerName.hasSuffix(".pdf") {
              files.append(file)
              if title == "Shared" || title == (urlString.flatMap { URL(string: $0)?.host } ?? "") {
                if !file.embedInMarkdownAsImage {
                  title = file.fileName
                }
              }
            }
          }
        }
      }

      if let suggested = item.attributedContentText?.string, !suggested.isEmpty, title == "Shared" {
        title = String(suggested.prefix(48))
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
      NSLog(
        "[AFFiNE Share] youtube enrich titleChars=%d descChars=%d transcriptChars=%d thumb=%d",
        enriched.title.count,
        enriched.description.count,
        enriched.transcriptMarkdown.count,
        enriched.thumbnailData?.count ?? 0
      )
      return SharePayloadDraft(
        title: sanitizeTitle(enriched.title.isEmpty ? title : enriched.title),
        markdown: markdown,
        previewText: String(previewSeed.prefix(280)),
        files: youtubeFiles
      )
    }

    if let safariMediaURL,
       let mediaFile = await loadRemoteImageFile(
         from: safariMediaURL,
         placeholder: "attachment://x-post-media",
         fileNamePrefix: "x-post-media"
       )
    {
      files.removeAll { $0.placeholder == mediaFile.placeholder }
      files.insert(mediaFile, at: 0)
      pageContent = pageContent?.replacingOccurrences(
        of: safariMediaURL,
        with: mediaFile.placeholder
      )
    }

    // Prefer full page body over short share-sheet title text.
    let body: String?
    if let pageContent, !pageContent.isEmpty {
      body = pageContent
    } else if let textBody,
              textBody != urlString,
              textBody != title,
              textBody.count > max(title.count + 8, 24)
    {
      body = textBody
    } else {
      body = nil
    }

    var markdownParts: [String] = []
    if let urlString {
      markdownParts.append("[Source](\(urlString))")
    }
    if let body {
      markdownParts.append(body)
    } else if let urlString {
      // Keep a visible editable body even when only the link is available.
      markdownParts.append(urlString)
    }
    for file in files {
      let alreadyReferenced = markdownParts.contains { $0.contains(file.placeholder) }
      if file.embedInMarkdownAsImage {
        if !alreadyReferenced {
          markdownParts.append("![Shared Image](\(file.placeholder))")
        }
      } else {
        markdownParts.append("Shared file: \(file.fileName)")
        markdownParts.append("(\(file.mimeType))")
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
      markdown: markdown.isEmpty ? preview : markdown,
      previewText: String(preview.prefix(280)),
      files: files
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
      typeIdentifier: UTType.propertyList.identifier
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

  private static func loadPropertyListItem(from provider: NSItemProvider) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if let item {
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
        if let string = item as? String {
          continuation.resume(returning: string)
        } else if let data = item as? Data,
                  let string = String(data: data, encoding: .utf8)
                    ?? String(data: data, encoding: .utf16)
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

  @MainActor
  private static func htmlToPlainText(_ html: String) -> String {
    guard let data = html.data(using: .utf8) else { return html }
    let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
      .documentType: NSAttributedString.DocumentType.html,
      .characterEncoding: String.Encoding.utf8.rawValue,
    ]
    guard let attributed = try? NSAttributedString(
      data: data,
      options: options,
      documentAttributes: nil
    ) else {
      return html
    }
    return attributed.string
      .replacingOccurrences(of: "\u{00a0}", with: " ")
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func loadPreferredFile(from provider: NSItemProvider) async -> SharePayloadFile? {
    let candidates: [(UTType, Bool)] = [
      (UTType.pdf, false),
      (UTType(filenameExtension: "webarchive") ?? UTType.data, false),
      (.image, true),
      (.jpeg, true),
      (.png, true),
      (.heic, true),
      (.webP, true),
      (.fileURL, false),
    ]

    for (type, isImage) in candidates {
      let typeId = type.identifier
      guard provider.hasItemConformingToTypeIdentifier(typeId) else { continue }

      if type.conforms(to: .fileURL) || typeId == UTType.fileURL.identifier {
        if let fileURL = try? await loadURL(from: provider, typeIdentifier: typeId),
           fileURL.isFileURL,
           let data = try? Data(contentsOf: fileURL)
        {
          let fileName = fileURL.lastPathComponent
          let mime = mimeType(forFileName: fileName)
          let embedImage = mime.hasPrefix("image/")
          return SharePayloadFile(
            data: data,
            mimeType: mime,
            fileName: fileName,
            placeholder: embedImage ? "attachment://shared-image" : "attachment://shared-file",
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

      let ext = fileExtension(for: type)
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
        data: data,
        mimeType: mimeType(for: type),
        fileName: fileName,
        placeholder: isImage ? "attachment://shared-image" : "attachment://shared-file",
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
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
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
      let (data, response) = try await URLSession.shared.data(for: request)
      guard !data.isEmpty,
            let http = response as? HTTPURLResponse,
            (200...299).contains(http.statusCode)
      else {
        return nil
      }
      let mimeType = http.value(forHTTPHeaderField: "Content-Type")?
        .components(separatedBy: ";")
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        ?? mimeType(forFileName: url.lastPathComponent)
      guard mimeType.hasPrefix("image/") else { return nil }
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

  private static func sanitizeTitle(_ title: String) -> String {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Shared" }
    return String(trimmed.prefix(120))
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
          continuation.resume(returning: string)
        } else if let data = item as? Data,
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
          continuation.resume(returning: data)
        } else if let url = item as? URL, let data = try? Data(contentsOf: url) {
          continuation.resume(returning: data)
        } else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
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
}
