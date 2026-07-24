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
    var imageData: Data?
    var imageMimeType: String?
    var imageFileName: String?

    for item in extensionItems {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if urlString == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          if let url = try? await loadURL(from: provider) {
            urlString = url.absoluteString
            if title == "Shared" {
              title = url.host ?? url.absoluteString
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

        if imageData == nil {
          let imageTypes = [UTType.image, UTType.jpeg, UTType.png, UTType.heic, UTType.webP]
          for type in imageTypes where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if let data = try? await loadData(from: provider, typeIdentifier: type.identifier) {
              imageData = data
              imageMimeType = mimeType(for: type)
              imageFileName = "shared.\(fileExtension(for: type))"
              if title == "Shared" {
                title = "Shared Image"
              }
              break
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
      markdownParts.append("")
      markdownParts.append(urlString)
    }
    if let textBody {
      if urlString == nil || textBody != urlString {
        markdownParts.append(textBody)
      }
    }
    if imageData != nil {
      markdownParts.append("![Shared Image](attachment://shared-image)")
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
    } else if imageData != nil {
      preview = "Image"
    } else {
      preview = "Shared content"
    }

    return SharePayloadDraft(
      title: sanitizeTitle(title),
      markdown: markdown.isEmpty ? preview : markdown,
      previewText: String(preview.prefix(200)),
      imageData: imageData,
      imageMimeType: imageMimeType,
      imageFileName: imageFileName
    )
  }

  static func resolveMarkdown(
    item: ShareInboxItem,
    store: ShareInboxStore = .shared
  ) -> String {
    var markdown = item.markdown
    guard markdown.contains("attachment://shared-image") else {
      return markdown
    }

    for attachment in item.attachments {
      guard let url = store.attachmentURL(for: attachment),
            let data = try? Data(contentsOf: url)
      else {
        continue
      }
      let base64 = data.base64EncodedString()
      let dataURI = "data:\(attachment.mimeType);base64,\(base64)"
      markdown = markdown.replacingOccurrences(
        of: "attachment://shared-image",
        with: dataURI
      )
    }

    // Drop unresolved attachment markers so import still succeeds.
    markdown = markdown.replacingOccurrences(
      of: "![Shared Image](attachment://shared-image)",
      with: ""
    )
    return markdown.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func sanitizeTitle(_ title: String) -> String {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Shared" }
    return String(trimmed.prefix(120))
  }

  private static func loadURL(from provider: NSItemProvider) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
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
    type.preferredMIMEType ?? "image/jpeg"
  }

  private static func fileExtension(for type: UTType) -> String {
    type.preferredFilenameExtension ?? "jpg"
  }
}
