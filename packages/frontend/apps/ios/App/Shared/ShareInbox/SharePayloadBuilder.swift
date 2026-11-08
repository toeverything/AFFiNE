import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

enum SharePayloadBuilder {
  static let maxImageBytes = 12 * 1024 * 1024
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

  static func nonEmpty(_ value: String?) -> String? {
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

}
