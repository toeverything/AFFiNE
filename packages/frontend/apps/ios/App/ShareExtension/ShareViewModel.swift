import Foundation
import UIKit

@MainActor
final class ShareViewModel: ObservableObject {
  @Published var title = ""
  @Published var previewText = ""
  @Published var previewImage: UIImage?
  @Published var isLoading = true
  @Published var isSaving = false
  @Published var hasSaved = false
  @Published var errorMessage: String?
  @Published var linkPreviewState: ShareLinkPreviewState = .idle
  @Published var linkPreviewMediaImage: UIImage?
  @Published var linkPreviewFaviconImage: UIImage?

  var actionTitle: String {
    "Open AFFiNE"
  }

  var canSave: Bool {
    !isLoading
      && !isSaving
      && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && draft?.content != nil
  }

  private var draft: SharePayloadDraft?
  private var previewRoute: SharePreviewRoute = .deferred
  private var previewTask: Task<Void, Never>?
  private var userEditedTitle: String?
  private let store: ShareInboxStore
  private let previewClient: ShareLinkPreviewClient

  init(
    store: ShareInboxStore = .shared,
    previewClient: ShareLinkPreviewClient = ShareLinkPreviewClient()
  ) {
    self.store = store
    self.previewClient = previewClient
  }

  var linkPreview: ShareLinkPreview? {
    guard case let .loaded(preview) = linkPreviewState else { return nil }
    return preview
  }

  var displayTitle: String {
    ShareInboxSafety.previewTitle(
      original: title,
      userEdited: userEditedTitle,
      serverTitle: linkPreview?.title
    )
  }

  var sharedURL: String? { draft?.content?.url }

  var selectedText: String? {
    guard draft?.content?.kind == .url else { return nil }
    return draft?.content?.text
  }

  func updateTitle(_ value: String) {
    userEditedTitle = value
    title = value
  }

  func load(from extensionContext: NSExtensionContext?) async {
    isLoading = true
    defer { isLoading = false }

    let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    let built = await SharePayloadBuilder.build(from: items)
    draft = built
    userEditedTitle = nil
    title = built.title
    previewText = built.previewText
    errorMessage = built.errorMessage
    linkPreviewMediaImage = nil
    linkPreviewFaviconImage = nil
    if let file = built.file {
      previewImage = UIImage(data: file.data)?
        .preparingThumbnail(of: CGSize(width: 480, height: 480))
    }
    guard built.content?.kind == .url, let url = built.content?.url else { return }
    previewRoute = ShareInboxSafety.previewRoute(mode: store.workspaceMode(), url: url)
    guard previewRoute == .official else {
      linkPreviewState = .deferred
      return
    }
    linkPreviewState = .loading
    previewTask = Task { [weak self] in
      guard let self else { return }
      do {
        let preview = try await previewClient.fetch(url: url)
        guard !Task.isCancelled else { return }
        linkPreviewState = .loaded(preview)
        async let media = previewClient.fetchImageIfPresent(url: preview.images?.first)
        async let favicon = previewClient.fetchImageIfPresent(url: preview.favicons?.first)
        let images = await (media, favicon)
        guard !Task.isCancelled else { return }
        linkPreviewMediaImage = images.0
        linkPreviewFaviconImage = images.1
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled else { return }
        linkPreviewState = .failed
      }
    }
  }

  func save() async -> Bool {
    guard !isSaving, !hasSaved else { return false }
    previewTask?.cancel()
    isSaving = true
    defer { isSaving = false }

    let trimmedTitle = ShareInboxSafety.manifestTitle(
      original: draft?.title ?? title,
      userEdited: userEditedTitle
    )
    guard !trimmedTitle.isEmpty else {
      errorMessage = "Title is required."
      return false
    }
    guard let draft, let content = draft.content else {
      errorMessage = draft?.errorMessage ?? "Nothing to share."
      return false
    }

    let itemId = UUID().uuidString
    var attachments: [ShareInboxAttachment] = []
    var attachmentData: [(ShareInboxAttachment, Data)] = []
    if let file = draft.file {
      let attachment = ShareInboxAttachment(
        fileName: file.fileName,
        mimeType: file.mimeType,
        relativePath: "\(itemId)/\(file.fileName)"
      )
      attachments = [attachment]
      attachmentData = [(attachment, file.data)]
    }

    let item = ShareInboxItem(
      id: itemId,
      title: trimmedTitle,
      content: content,
      previewRoute: previewRoute,
      previewText: draft.previewText,
      attachments: attachments
    )

    do {
      try store.enqueue(item, attachmentData: attachmentData)
      hasSaved = true
      return true
    } catch {
      errorMessage = "Failed to save shared content."
      return false
    }
  }
}
