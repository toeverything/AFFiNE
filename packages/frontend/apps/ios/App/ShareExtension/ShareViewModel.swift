import Foundation
import UIKit

enum ShareLinkPreviewState: Equatable {
  case idle
  case loading
  case loaded(ShareLinkPreview)
  case failed
}

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
  @Published var remoteMediaImage: UIImage?
  @Published var remoteFaviconImage: UIImage?

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
  private var userEditedTitle: String?
  private var loadGeneration = 0
  private var enrichmentGeneration = 0
  private var enrichmentTask: Task<Void, Never>?
  private let store: ShareInboxStore
  private let buildPayload: ([NSExtensionItem]) async -> SharePayloadDraft
  private let fetchLinkPreview: (String) async throws -> ShareLinkPreview
  private let fetchRemoteImage: (String?) async -> UIImage?

  init(
    store: ShareInboxStore = .shared,
    buildPayload: @escaping ([NSExtensionItem]) async -> SharePayloadDraft = { items in
      await SharePayloadBuilder.build(from: items)
    },
    fetchLinkPreview: ((String) async throws -> ShareLinkPreview)? = nil,
    fetchRemoteImage: ((String?) async -> UIImage?)? = nil
  ) {
    self.store = store
    self.buildPayload = buildPayload
    let previewClient = ShareLinkPreviewClient()
    self.fetchLinkPreview =
      fetchLinkPreview ?? { url in
        try await previewClient.fetch(url: url)
      }
    self.fetchRemoteImage =
      fetchRemoteImage ?? { url in
        await previewClient.fetchImageIfPresent(url: url)
      }
  }

  deinit {
    enrichmentTask?.cancel()
    draft?.discardStagingFiles()
  }

  var displayTitle: String {
    userEditedTitle ?? linkPreview?.title ?? title
  }

  var linkPreview: ShareLinkPreview? {
    guard case .loaded(let preview) = linkPreviewState else { return nil }
    return preview
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
    cancelEnrichment(resetState: true)
    loadGeneration &+= 1
    let generation = loadGeneration
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
    if let file = built.file {
      previewImage = UIImage(data: file.thumbnailData)?
        .preparingThumbnail(of: CGSize(width: 480, height: 480))
    } else {
      previewImage = nil
    }
    isLoading = false
    if let url = built.content?.url, built.content?.kind == .url {
      startEnrichment(for: url)
    }
  }

  func discard() {
    cancelEnrichment(resetState: true)
    loadGeneration &+= 1
    draft?.discardStagingFiles()
    draft = nil
    previewImage = nil
    isLoading = false
  }

  func save() async -> Bool {
    guard !isSaving, !hasSaved else { return false }
    isSaving = true
    let wasLoadingPreview = linkPreviewState == .loading
    let previewSnapshot = linkPreview
    cancelEnrichment(resetState: false)
    if wasLoadingPreview {
      linkPreviewState = .failed
    }
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
      previewText: draft.previewText,
      preview: previewSnapshot,
      attachments: attachments
    )

    do {
      try store.enqueue(item, attachmentFiles: attachmentFiles)
      hasSaved = true
      draft.discardStagingFiles()
      return true
    } catch {
      errorMessage = "Failed to save shared content."
      return false
    }
  }

  private func startEnrichment(for url: String) {
    enrichmentGeneration &+= 1
    let generation = enrichmentGeneration
    let fetchLinkPreview = fetchLinkPreview
    let fetchRemoteImage = fetchRemoteImage
    linkPreviewState = .loading
    remoteMediaImage = nil
    remoteFaviconImage = nil

    enrichmentTask = Task { [weak self] in
      let preview: ShareLinkPreview
      do {
        preview = try await fetchLinkPreview(url)
      } catch {
        guard !Task.isCancelled, generation == self?.enrichmentGeneration else {
          return
        }
        self?.linkPreviewState = .failed
        return
      }
      guard !Task.isCancelled, generation == self?.enrichmentGeneration else {
        return
      }
      self?.linkPreviewState = .loaded(preview)

      let mediaURL = preview.images?.first
      let faviconURL = preview.favicons?.first
      async let mediaImage = fetchRemoteImage(mediaURL)
      async let faviconImage = fetchRemoteImage(faviconURL)
      let images = await (mediaImage, faviconImage)
      guard !Task.isCancelled, generation == self?.enrichmentGeneration else { return }
      self?.remoteMediaImage = images.0
      self?.remoteFaviconImage = images.1
    }
  }

  private func cancelEnrichment(resetState: Bool) {
    enrichmentGeneration &+= 1
    enrichmentTask?.cancel()
    enrichmentTask = nil
    if resetState {
      linkPreviewState = .idle
      remoteMediaImage = nil
      remoteFaviconImage = nil
    }
  }
}
