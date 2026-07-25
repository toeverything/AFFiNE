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
    defer { isLoading = false }

    workspaces = store.recentWorkspaces()
    selectedWorkspaceId = store.lastWorkspaceId() ?? workspaces.first?.id

    // Safari may attach the JS preprocessing result slightly after launch.
    // For YouTube, JS also fetches captions asynchronously — wait before network enrich.
    var built = SharePayloadDraft(
      title: "Shared",
      markdown: "",
      previewText: "",
      files: []
    )
    for attempt in 0..<8 {
      let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
      // Probe without YouTube network work so we can detect URL + wait for Safari JS.
      let probe = await SharePayloadBuilder.build(from: items, enrichYouTube: false)
      let looksLikeYouTube =
        markdownLooksLikeYouTube(probe.markdown) || markdownLooksLikeYouTube(probe.title)

      if looksLikeYouTube, attempt < 3 {
        // Give Safari JS ~1s to finish async caption fetch before network enrich.
        built = probe
        try? await Task.sleep(nanoseconds: 350_000_000)
        continue
      }

      built =
        looksLikeYouTube
        ? await SharePayloadBuilder.build(from: items, enrichYouTube: true)
        : probe

      let hasYouTubeEnrichment =
        built.markdown.contains("attachment://youtube-thumbnail")
        || built.markdown.contains("## Transcript")
      let hasTranscript = built.markdown.contains("## Transcript")
      let hasBody = built.markdown.count > 40 || !(built.previewText.isEmpty)
      let hasTitleOrURL =
        built.title != "Shared"
        || built.markdown.contains("http://")
        || built.markdown.contains("https://")

      if hasTranscript || hasYouTubeEnrichment {
        break
      }
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
      previewImage = UIImage(data: imageFile.data)
    }

    NSLog(
      "[AFFiNE Share] loaded title=%@ markdownChars=%d files=%d",
      title,
      markdown.count,
      built.files.count
    )
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

    let body = markdown.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else {
      errorMessage = "Shared content is empty"
      return false
    }

    var attachments: [ShareInboxAttachment] = []
    var attachmentData: [(ShareInboxAttachment, Data)] = []

    for file in draft.files {
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
}
