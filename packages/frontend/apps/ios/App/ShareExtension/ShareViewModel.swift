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
  @Published var infoMessage: String?

  var hasWorkspaceCache: Bool { !workspaces.isEmpty }

  var selectedWorkspaceName: String {
    if let selectedWorkspaceId,
       let match = workspaces.first(where: { $0.id == selectedWorkspaceId })
    {
      return match.name
    }
    return workspaces.first?.name ?? "Workspace"
  }

  private var draft: SharePayloadDraft?
  private let store: ShareInboxStore

  init(store: ShareInboxStore = .shared) {
    self.store = store
  }

  func load(from extensionContext: NSExtensionContext?) async {
    isLoading = true
    errorMessage = nil
    infoMessage = nil
    defer { isLoading = false }

    workspaces = store.recentWorkspaces()
    let cachedLastId = store.lastWorkspaceId()
    if let cachedLastId, workspaces.contains(where: { $0.id == cachedLastId }) {
      selectedWorkspaceId = cachedLastId
    } else {
      selectedWorkspaceId = workspaces.first?.id
    }

    let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    var built = SharePayloadDraft(
      title: "Shared",
      markdown: "",
      previewText: "",
      files: []
    )
    for attempt in 0..<8 {
      let probe = await SharePayloadBuilder.build(from: items, enrichYouTube: false)
      let looksLikeYouTube =
        markdownLooksLikeYouTube(probe.markdown) || markdownLooksLikeYouTube(probe.title)

      if looksLikeYouTube, attempt < 3 {
        built = probe
        try? await Task.sleep(nanoseconds: 350_000_000)
        continue
      }

      if looksLikeYouTube {
        built = await SharePayloadBuilder.build(from: items, enrichYouTube: true)
        break
      }

      built = probe

      let hasBody = built.markdown.count > 40 || !(built.previewText.isEmpty)
      let hasTitleOrURL =
        built.title != "Shared"
        || built.markdown.contains("http://")
        || built.markdown.contains("https://")

      if (hasBody && hasTitleOrURL) || attempt == 7 {
        break
      }
      try? await Task.sleep(nanoseconds: 350_000_000)
    }

    draft = built
    title = built.title
    previewText = built.previewText
    markdown = built.markdown
    if markdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      markdown = built.previewText
    }
    if let imageFile = built.files.first(where: { $0.embedInMarkdownAsImage }) {
      previewImage = UIImage(data: imageFile.data)?
        .preparingThumbnail(of: CGSize(width: 480, height: 480))
    }
    if built.rejectedAttachmentCount > 0 {
      infoMessage = "Some attachments won't be imported."
    }

    #if DEBUG
      NSLog(
        "[AFFiNE Share] loaded markdownChars=%d files=%d",
        markdown.count,
        built.files.count
      )
    #endif
  }

  func save() async -> Bool {
    guard !isSaving else { return false }
    isSaving = true
    errorMessage = nil
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

    let imageFiles = draft.files.filter(\.embedInMarkdownAsImage)
    let body = markdown.trimmingCharacters(in: .whitespacesAndNewlines)
    if draft.rejectedAttachmentCount > 0, isGenericFallbackBody(body) {
      errorMessage = "File attachments are not supported yet. Share a link or image."
      return false
    }
    guard !body.isEmpty else {
      errorMessage = "Shared content is empty"
      return false
    }

    var attachments: [ShareInboxAttachment] = []
    var attachmentData: [(ShareInboxAttachment, Data)] = []

    for file in imageFiles {
      let relativePath = "\(UUID().uuidString)/\(file.fileName)"
      let attachment = ShareInboxAttachment(
        fileName: file.fileName,
        mimeType: file.mimeType,
        relativePath: relativePath,
        placeholder: file.placeholder
      )
      attachments.append(attachment)
      attachmentData.append((attachment, file.data))
    }

    let item = ShareInboxItem(
      title: trimmedTitle,
      markdown: body,
      workspaceId: selectedWorkspaceId,
      previewText: String(body.prefix(280)),
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

  private func markdownLooksLikeYouTube(_ value: String) -> Bool {
    let lower = value.lowercased()
    return lower.contains("youtube.com/")
      || lower.contains("youtu.be/")
      || lower.contains("youtube.com/watch")
      || lower.contains("m.youtube.com/")
  }

  private func isGenericFallbackBody(_ body: String) -> Bool {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty || trimmed == "Shared content"
  }
}
