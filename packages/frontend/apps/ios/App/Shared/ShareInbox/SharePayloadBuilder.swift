//
//  SharePayloadBuilder.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
  static func build(from extensionItems: [NSExtensionItem]) async -> SharePayloadDraft {
    var title = "Shared"
    var urlString: String?
    var textBody: String?
    var files: [SharePayloadFile] = []

    for item in extensionItems {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
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
            files.append(file)
            if title == "Shared" || title == (urlString.flatMap { URL(string: $0)?.host } ?? "") {
              title = file.fileName
            }
          }
        }
      }

      if let suggested = item.attributedContentText?.string, !suggested.isEmpty, title == "Shared" {
        title = String(suggested.prefix(48))
      }
    }

    var markdownParts: [String] = []
    if let urlString {
      markdownParts.append("[\(title)](\(urlString))")
      markdownParts.append(urlString)
    }
    if let textBody {
      if urlString == nil || textBody != urlString {
        markdownParts.append(textBody)
      }
    }
    for file in files {
      if file.embedInMarkdownAsImage {
        markdownParts.append("![Shared Image](\(file.placeholder))")
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
    if let urlString {
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
      previewText: String(preview.prefix(200)),
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
      (.data, false),
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
}
