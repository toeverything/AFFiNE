//
//  ChatManager+Stream.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import AffineGraphQL
import EventSource
import Foundation
import MarkdownParser
import MarkdownView
import UniformTypeIdentifiers

private let loadingIndicator = " ●"

private extension InputBoxData {
  var hasAttachment: Bool {
    if !imageAttachments.isEmpty { return false }
    if !fileAttachments.isEmpty { return false }
    if !documentAttachments.isEmpty { return false }
    return true
  }
}

public extension ChatManager {
  @MainActor
  func startUserRequest(editorData: InputBoxData, sessionId: String) {
    append(sessionId: sessionId, UserMessageCellViewModel(
      id: .init(),
      content: editorData.text,
      timestamp: .init()
    ))
    append(sessionId: sessionId, UserHintCellViewModel(
      id: .init(),
      timestamp: .init(),
      imageAttachments: editorData.imageAttachments,
      fileAttachments: editorData.fileAttachments,
      docAttachments: editorData.documentAttachments
    ))

    let viewModelId = append(sessionId: sessionId, AssistantMessageCellViewModel(
      id: .init(),
      content: "...",
      timestamp: .init()
    ))
    scrollToBottomPublisher.send(sessionId)

    guard let workspaceId = IntelligentContext.shared.currentWorkspaceId,
          !workspaceId.isEmpty
    else {
      report(sessionId, ChatError.unknownError)
      assertionFailure("Invalid workspace ID")
      return
    }

    DispatchQueue.global().async {
      self.startCopilotResponse(
        workspaceId: workspaceId,
        editorData: editorData,
        sessionId: sessionId,
        viewModelId: viewModelId
      )
    }
  }
}

private extension ChatManager {
  func startCopilotResponse(
    workspaceId: String,
    editorData: InputBoxData,
    sessionId: String,
    viewModelId: UUID
  ) {
    assert(!Thread.isMainThread)
    print("[+] starting copilot response for session: \(sessionId)")

    let uploadableAttachments: [CopilotAttachmentUpload] = [
      editorData.fileAttachments.map { file -> CopilotAttachmentUpload in
        .init(
          data: file.data ?? .init(),
          mimeType: mimeType(text: file.name),
          originalName: file.name
        )
      },
      editorData.imageAttachments.map { image -> CopilotAttachmentUpload in
        .init(
          data: image.imageData,
          mimeType: mimeType(pathExtension: "jpg"),
          originalName: "image.jpg"
        )
      },
    ].flatMap(\.self)
    assert(uploadableAttachments.allSatisfy { !$0.data.isEmpty })
    Task {
      do {
        let selectedDocumentIds = editorData.documentAttachments.map(\.documentID)
        if !selectedDocumentIds.isEmpty {
          try await IntelligentContext.shared.waitForSelectedSources(selectedDocumentIds)
        }
        let messageParameters: AffineGraphQL.JSON = [
          // packages/frontend/core/src/blocksuite/ai/provider/setup-provider.tsx
          "scopeSelectors": editorData.documentAttachments.map { attachment in
            [
              "kind": "document",
              "id": attachment.documentID,
              "name": attachment.title,
              "source": "draft",
            ]
          },
          "searchMode": editorData.isSearchEnabled ? "MUST" : "AUTO",
        ]
        let messageIdentifier = try await QLService.shared.createCopilotMessage(
          workspaceId: workspaceId,
          sessionId: sessionId,
          content: editorData.text,
          params: messageParameters,
          attachments: uploadableAttachments
        )
        DispatchQueue.main.async {
          self.startStreamingResponse(
            sessionId: sessionId,
            messageId: messageIdentifier,
            applyingTo: viewModelId
          )
        }
      } catch {
        DispatchQueue.main.async {
          self.report(sessionId, error)
          self.delete(sessionId: sessionId, vmId: viewModelId)
        }
      }
    }
  }

  private func pathExtension(for text: String) -> String {
    (text as NSString).pathExtension
  }

  private func mimeType(pathExtension: String) -> String {
    let type = UTType(filenameExtension: pathExtension) ?? .data
    return type.preferredMIMEType ?? "application/octet-stream"
  }

  private func mimeType(text: String) -> String {
    let pathExt = pathExtension(for: text)
    return mimeType(pathExtension: pathExt)
  }
}

private extension ChatManager {
  func startStreamingResponse(sessionId: String, messageId: String, applyingTo vmId: UUID) {
    print("[+] starting streaming response for session: \(sessionId), message: \(messageId)")
    let base = IntelligentContext.shared.webViewMetadata[.currentServerBaseUrl] as? String
    guard let base, let url = URL(string: base) else {
      report(sessionId, ChatError.invalidServerConfiguration)
      return
    }
    let streamUrl = url
      .appendingPathComponent("api")
      .appendingPathComponent("copilot")
      .appendingPathComponent("chat")
      .appendingPathComponent(sessionId)
      .appendingPathComponent("stream")
    var comps = URLComponents(url: streamUrl, resolvingAgainstBaseURL: false)
    comps?.queryItems = [
      .init(name: "messageId", value: messageId),
      .init(name: "retry", value: "false"), // TODO: IMPL FROM UI
    ]
    guard let finalUrl = comps?.url else {
      report(sessionId, ChatError.invalidStreamURL)
      return
    }
    var request = URLRequest(
      url: finalUrl,
      cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
      timeoutInterval: 10
    )
    request.setValue("close", forHTTPHeaderField: "Connection")
    request = QLService.shared.authorized(request)

    let closable = ClosableTask(detachedTask: .detached(operation: {
      let eventSource = EventSource()
      let dataTask = eventSource.dataTask(for: request)
      var document = ""
      await self.writeMarkdownContent(document + loadingIndicator, sessionId: sessionId, vmId: vmId)
      for await event in dataTask.events() {
        switch event {
        case .open:
          print("[*] connection opened")
        case let .error(error):
          print("[!] error occurred", error)
        case let .event(event):
          guard let data = event.data else { continue }
          document += data
          await self.writeMarkdownContent(
            document + loadingIndicator,
            sessionId: sessionId,
            vmId: vmId
          )
          self.scrollToBottomPublisher.send(sessionId)
        case .closed:
          print("[*] connection closed")
        }
      }
      await self.writeMarkdownContent(document, sessionId: sessionId, vmId: vmId)
      self.closeAll()
    }))
    self.closable.append(closable)
  }

  @MainActor private func writeMarkdownContent(
    _ document: String,
    sessionId: SessionID,
    vmId: UUID
  ) {
    let result = MarkdownParser().parse(document)
    let content = MarkdownTextView.PreprocessedContent(parserResult: result, theme: .default)

    with(sessionId: sessionId, vmId: vmId) { (viewModel: inout AssistantMessageCellViewModel) in
      viewModel.content = document
      viewModel.preprocessedContent = content
    }
  }
}
