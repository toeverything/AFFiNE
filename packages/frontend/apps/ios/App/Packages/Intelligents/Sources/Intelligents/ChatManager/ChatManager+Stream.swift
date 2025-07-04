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

extension ChatManager {
  public func startUserRequest(
    content: String,
    inputBoxData: InputBoxData,
    sessionId: String
  ) {
    append(sessionId: sessionId, UserMessageCellViewModel(
      id: .init(),
      content: inputBoxData.text,
      timestamp: .init(),
      attachments: []
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
    let eventSource = EventSource(
      request: .init(
        url: finalUrl,
        cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
        timeoutInterval: 10
      ),
      configuration: .default
    )
    eventSource.onOpen = {
      print("[*] \(messageId): connection established")
    }
    eventSource.onError = {
      self.report(sessionId, $0 ?? ChatError.unknownError)
    }

    var document = ""
    let queue = DispatchQueue(label: "com.affine.chat.stream.\(sessionId)")
    eventSource.onMessage = { event in
      queue.async {
        print("[*] \(messageId): \(event.event ?? "?") received message: \(event.data)")
        switch event.event {
        case "message":
          document += event.data
          self.with(sessionId: sessionId, vmId: vmId) { (viewModel: inout AssistantMessageCellViewModel) in
            viewModel.content = document
          }
        default:
          break
        }
      }
    }
    closable.append(eventSource)
  }
}
