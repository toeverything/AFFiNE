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

  private var previewRoute: SharePreviewRoute = .deferred
  private var draft: SharePayloadDraft?
  private var userEditedTitle: String?
  private var loadGeneration = 0
  private var previewTask: Task<Void, Never>?
  private let store: ShareInboxStore
  private let previewClient: ShareLinkPreviewClient
  private let buildPayload: ([NSExtensionItem]) async -> SharePayloadDraft

  init(
    store: ShareInboxStore = .shared,
    previewClient: ShareLinkPreviewClient = ShareLinkPreviewClient(),
    buildPayload: @escaping ([NSExtensionItem]) async -> SharePayloadDraft = { items in
      await SharePayloadBuilder.build(from: items)
    }
  ) {
    self.store = store
    self.previewClient = previewClient
    self.buildPayload = buildPayload
  }

  deinit {
    draft?.discardStagingFiles()
  }

  var displayTitle: String {
    ShareInboxSafety.previewTitle(
      original: title,
      userEdited: userEditedTitle,
      serverTitle: linkPreview?.title
    )
  }

  var linkPreview: ShareLinkPreview? {
    guard case let .loaded(preview) = linkPreviewState else { return nil }
    return preview
  }

  var sharedURL: String? {
    draft?.content?.url
  }

  var selectedText: String? {
    guard draft?.content?.kind == .url else { return nil }
    return draft?.content?.text
  }

  func updateTitle(_ value: String) {
    userEditedTitle = value
    title = value
  }

  func load(from extensionContext: NSExtensionContext?) async {
    loadGeneration &+= 1
    let generation = loadGeneration
    previewTask?.cancel()
    isLoading = true

    let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    let built = await buildPayload(items)
    guard generation == loadGeneration else {
      built.discardStagingFiles()
      return
    }
    draft?.discardStagingFiles()
    draft = built
    userEditedTitle = nil
    title = built.title
    previewText = built.previewText
    errorMessage = built.errorMessage
    linkPreviewState = .idle
    linkPreviewMediaImage = nil
    linkPreviewFaviconImage = nil
    if let file = built.file {
      previewImage = UIImage(data: file.thumbnailData)?
        .preparingThumbnail(of: CGSize(width: 480, height: 480))
    } else {
      previewImage = nil
    }
    isLoading = false
    previewRoute = built.content?.url.map { ShareInboxSafety.previewRoute(url: $0, mode: store.workspaceMode()) } ?? .deferred
    guard built.content?.kind == .url, let url = built.content?.url, previewRoute == .official else {
      return
    }
    linkPreviewState = .loading
    previewTask = Task { [weak self] in
      guard let self else { return }
      do {
        let preview = try await previewClient.fetch(url: url)
        guard !Task.isCancelled, generation == loadGeneration else { return }
        linkPreviewState = .loaded(preview)
        async let media = previewClient.fetchImageIfPresent(url: preview.images?.first)
        async let favicon = previewClient.fetchImageIfPresent(url: preview.favicons?.first)
        let images = await (media, favicon)
        guard !Task.isCancelled, generation == loadGeneration else { return }
        linkPreviewMediaImage = images.0
        linkPreviewFaviconImage = images.1
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, generation == loadGeneration else { return }
        linkPreviewState = .failed
      }
    }
  }

  func discard() {
    loadGeneration &+= 1
    previewTask?.cancel()
    draft?.discardStagingFiles()
    draft = nil
    previewImage = nil
    linkPreviewState = .idle
    linkPreviewMediaImage = nil
    linkPreviewFaviconImage = nil
    isLoading = false
  }

  func save() async -> Bool {
    guard !isSaving, !hasSaved else { return false }
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
    var attachmentFiles: [(ShareInboxAttachment, URL)] = []
    if let file = draft.file {
      let attachment = ShareInboxAttachment(
        fileName: file.name,
        mimeType: file.mimeType,
        relativePath: "\(itemId)/\(file.name)"
      )
      attachments = [attachment]
      attachmentFiles = [(attachment, file.ownedStagingURL)]
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
      try store.enqueue(item, attachmentFiles: attachmentFiles)
      hasSaved = true
      previewTask?.cancel()
      draft.discardStagingFiles()
      return true
    } catch {
      errorMessage = "Failed to save shared content."
      return false
    }
  }
}
