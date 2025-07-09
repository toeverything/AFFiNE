//
//  ChatManager+Stream.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import EventSource
import Foundation
import MarkdownParser
import MarkdownView

private let loadingIndicator = " ●"

private extension InputBoxData {
  var hasAttachment: Bool {
    if !imageAttachments.isEmpty { return false }
    if !fileAttachments.isEmpty { return false }
    if !documentAttachments.isEmpty { return false }
    return true
  }
}

extension ChatManager {
  public func startUserRequest(
    content: String,
    inputBoxData: InputBoxData,
    sessionId: String
  ) {
    append(sessionId: sessionId, UserMessageCellViewModel(
      id: .init(),
      content: inputBoxData.text,
      timestamp: .init()
    ))
    append(sessionId: sessionId, UserHintCellViewModel(
      id: .init(),
      timestamp: .init(),
      imageAttachments: inputBoxData.imageAttachments,
      fileAttachments: inputBoxData.fileAttachments,
      docAttachments: inputBoxData.documentAttachments
    ))

    let messageParameters: [String: AnyHashable] = [
      // packages/frontend/core/src/blocksuite/ai/provider/setup-provider.tsx
      "docs": inputBoxData.documentAttachments.map(\.documentID), // affine doc
      "files": [String](), // attachment in context, keep nil for now
      "searchMode": inputBoxData.isSearchEnabled ? "MUST" : "AUTO",
    ]
    let uploadableAttachments: [GraphQLFile] = [
      inputBoxData.fileAttachments.map { file -> GraphQLFile in
        .init(
          fieldName: file.name,
          originalName: file.name,
          data: file.data ?? .init()
        )
      },
      inputBoxData.imageAttachments.map { image -> GraphQLFile in
        .init(
          fieldName: image.hashValue.description,
          originalName: "image.jpg",
          data: image.imageData
        )
      },
    ].flatMap(\.self)
    assert(uploadableAttachments.allSatisfy { !($0.data?.isEmpty ?? true) })
    guard let input = try? CreateChatMessageInput(
      content: .some(content),
      params: .some(AffineGraphQL.JSON(_jsonValue: messageParameters)),
      sessionId: sessionId
    ) else {
      assertionFailure() // very unlikely to happen
      return
    }
    let mutation = CreateCopilotMessageMutation(options: input)
    QLService.shared.client.upload(operation: mutation, files: uploadableAttachments) { result in
      DispatchQueue.main.async {
        switch result {
        case let .success(graphQLResult):
          guard let messageIdentifier = graphQLResult.data?.createCopilotMessage else {
            self.report(sessionId, ChatError.invalidResponse)
            return
          }
          let viewModelId = self.append(sessionId: sessionId, AssistantMessageCellViewModel(
            id: .init(),
            content: .init(),
            timestamp: .init()
          ))
          self.startStreamingResponse(
            sessionId: sessionId,
            messageId: messageIdentifier,
            applyingTo: viewModelId
          )
        case let .failure(error):
          self.report(sessionId, error)
        }
      }
    }
  }

  private func startStreamingResponse(sessionId: String, messageId: String, applyingTo vmId: UUID) {
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

    let closable = ClosableTask(detachedTask: .detached(operation: {
      let eventSource = EventSource()
      let dataTask = await eventSource.dataTask(for: request)
      var document = ""
      self.writeMarkdownContent(document + loadingIndicator, sessionId: sessionId, vmId: vmId)
      for await event in await dataTask.events() {
        switch event {
        case .open:
          print("[*] connection opened")
        case let .error(error):
          print("[!] error occurred", error)
        case let .event(event):
          guard let data = event.data else { continue }
          document += data
          self.writeMarkdownContent(
            document + loadingIndicator,
            sessionId: sessionId,
            vmId: vmId
          )
          self.scrollToBottomPublisher.send(sessionId)
        case .closed:
          print("[*] connection closed")
        }
      }
      self.writeMarkdownContent(document, sessionId: sessionId, vmId: vmId)
      self.closeAll()
    }))
    self.closable.append(closable)
  }

  private func writeMarkdownContent(
    _ document: String,
    sessionId: SessionID,
    vmId: UUID
  ) {
    let result = MarkdownParser().parse(document)
    var renderedContexts: [String: RenderedItem] = [:]
    for (key, value) in result.mathContext {
      let image = MathRenderer.renderToImage(
        latex: value,
        fontSize: MarkdownTheme.default.fonts.body.pointSize,
        textColor: MarkdownTheme.default.colors.body
      )?.withRenderingMode(.alwaysTemplate)
      let renderedContext = RenderedItem(
        image: image,
        text: value
      )
      renderedContexts["math://\(key)"] = renderedContext
    }

    with(sessionId: sessionId, vmId: vmId) { (viewModel: inout AssistantMessageCellViewModel) in
      viewModel.content = document
      viewModel.documentBlocks = result.document
      viewModel.documentRenderedContent = renderedContexts
    }
  }
}
