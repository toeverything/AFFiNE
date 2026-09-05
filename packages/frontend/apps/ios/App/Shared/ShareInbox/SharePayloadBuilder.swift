import Foundation
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
  private static let maxImageBytes = 12 * 1024 * 1024
  private static let maxTextCharacters = 250_000

  static func build(from extensionItems: [NSExtensionItem]) async -> SharePayloadDraft {
    var title = "Shared"
    var url: String?
    var text: String?
    var fallbackText: String?
    var file: SharePayloadFile?
    var imageProviderCount = 0

    for item in extensionItems {
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier),
           let page = try? await loadSafariPage(from: provider)
        {
          title = page.title ?? title
          url = page.url ?? url
          text = page.selectedText.map {
            String($0.prefix(maxTextCharacters))
          } ?? text
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
      selectedText: nonEmpty(result["selectedText"] as? String)
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
