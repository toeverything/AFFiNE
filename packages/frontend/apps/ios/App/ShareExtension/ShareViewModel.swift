//
//  ShareViewModel.swift
//  ShareExtension
//

import Foundation
import UIKit

@MainActor
final class ShareViewModel: ObservableObject {
  @Published var title: String = ""
  @Published var previewText: String = ""
  @Published var markdown: String = ""
  @Published var selectedWorkspaceId: String?
  @Published var workspaces: [ShareWorkspaceInfo] = []
  @Published var previewImage: UIImage?
  @Published var isLoading = true
  @Published var isSaving = false
  @Published var errorMessage: String?

  var hasWorkspaceCache: Bool { !workspaces.isEmpty }

  private var draft: SharePayloadDraft?
  private let store: ShareInboxStore

  init(store: ShareInboxStore = .shared) {
    self.store = store
  }

  func load(from extensionContext: NSExtensionContext?) async {
    isLoading = true
    defer { isLoading = false }

    workspaces = store.recentWorkspaces()
    selectedWorkspaceId = store.lastWorkspaceId() ?? workspaces.first?.id

    let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    let built = await SharePayloadBuilder.build(from: items)
    draft = built
    title = built.title
    previewText = built.previewText
    markdown = built.markdown
    if let imageData = built.imageData {
      previewImage = UIImage(data: imageData)
    }
  }

  func save() async -> Bool {
    guard !isSaving else { return false }
    isSaving = true
    defer { isSaving = false }

    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedTitle.isEmpty else {
      errorMessage = "Title is required"
      return false
    }

    guard let draft else {
      errorMessage = "Nothing to share"
      return false
    }

    var attachments: [ShareInboxAttachment] = []
    var attachmentData: [(ShareInboxAttachment, Data)] = []

    if let imageData = draft.imageData {
      let fileName = draft.imageFileName ?? "shared.jpg"
      let relativePath = "\(UUID().uuidString)/\(fileName)"
      let attachment = ShareInboxAttachment(
        fileName: fileName,
        mimeType: draft.imageMimeType ?? "image/jpeg",
        relativePath: relativePath
      )
      attachments.append(attachment)
      attachmentData.append((attachment, imageData))
    }

    let item = ShareInboxItem(
      title: trimmedTitle,
      markdown: markdown.isEmpty ? draft.markdown : markdown,
      workspaceId: selectedWorkspaceId,
      previewText: previewText,
      attachments: attachments
    )

    do {
      try store.enqueue(item, attachmentData: attachmentData)
      return true
    } catch {
      errorMessage = "Failed to save shared content"
      return false
    }
  }
}
