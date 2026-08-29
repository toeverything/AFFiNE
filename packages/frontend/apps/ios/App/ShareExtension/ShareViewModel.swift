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
  private let store: ShareInboxStore
  private let buildPayload: ([NSExtensionItem]) async -> SharePayloadDraft

  init(
    store: ShareInboxStore = .shared,
    buildPayload: @escaping ([NSExtensionItem]) async -> SharePayloadDraft = { items in
      await SharePayloadBuilder.build(from: items)
    }
  ) {
    self.store = store
    self.buildPayload = buildPayload
  }

  deinit {
    draft?.discardStagingFiles()
  }

  var displayTitle: String {
    userEditedTitle ?? title
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
  }

  func discard() {
    loadGeneration &+= 1
    draft?.discardStagingFiles()
    draft = nil
    previewImage = nil
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
      previewText: draft.previewText,
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
}
