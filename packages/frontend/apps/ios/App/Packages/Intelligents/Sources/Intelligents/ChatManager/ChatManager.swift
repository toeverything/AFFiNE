//
//  ChatManager.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import Combine
import EventSource
import Foundation
import OrderedCollections

protocol Closable {
  func close()
}

extension EventSource: @preconcurrency Closable {}

public class ChatManager: ObservableObject {
  public static let shared = ChatManager()

  public typealias SessionID = String
  public typealias MessageID = UUID // ChatCellViewModel ID
  @Published public private(set) var viewModels: OrderedDictionary<
    SessionID,
    OrderedDictionary<MessageID, any ChatCellViewModel>
  > = [:]

  private var closable: [Closable] = []

  private init() {}

  public func closeAll() {
    closable.forEach { $0.close() }
    closable.removeAll()
  }

  public func startUserRequest(
    content: String,
    inputBoxData: InputBoxData,
    sessionId: String
  ) {
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
            self.resolveError(sessionId, ChatError.invalidResponse)
            return
          }
          self.startStreamingResponse(
            sessionId: sessionId,
            messageId: messageIdentifier
          )
        case let .failure(error):
          self.resolveError(sessionId, error)
        }
      }
    }
  }

  private func resolveError(_: String, _ error: Error) {
    assert(Thread.isMainThread)
    let text = error.localizedDescription
    // TODO: SEND TO VIEW MODEL
    print(text)
  }

  private func startStreamingResponse(sessionId: String, messageId: String) {
    let base = IntelligentContext.shared.webViewMetadata[.currentServerBaseUrl] as? String
    guard let base, let url = URL(string: base) else {
      resolveError(sessionId, ChatError.invalidServerConfiguration)
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
      resolveError(sessionId, ChatError.invalidStreamURL)
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
      self.resolveError(sessionId, $0 ?? ChatError.unknownError)
    }
    eventSource.onMessage = { event in
      print("[*] \(messageId): \(event.event ?? "?") received message: \(event.data)")
      switch event.event {
      default: break
      }
    }
    closable.append(eventSource)
  }
}
