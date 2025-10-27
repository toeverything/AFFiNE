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
      self.prepareContext(
        workspaceId: workspaceId,
        sessionId: sessionId,
        editorData: editorData,
        viewModelId: viewModelId
      )
    }
  }
}

private extension ChatManager {
  func prepareContext(
    workspaceId: String,
    sessionId: String,
    editorData: InputBoxData,
    viewModelId: UUID
  ) {
    assert(!Thread.isMainThread)
    let createContext = CreateCopilotContextMutation(
      workspaceId: workspaceId,
      sessionId: sessionId
    )
    QLService.shared.client.perform(mutation: createContext) { result in
      DispatchQueue.main.async {
        switch result {
        case let .success(graphQLResult):
          guard let contextId = graphQLResult.data?.createCopilotContext else {
            self.report(sessionId, ChatError.invalidResponse)
            return
          }
          print("[+] copilot context created: \(contextId)")

          DispatchQueue.global().async {
            let docAttachGroup = DispatchGroup()
            for docAttach in editorData.documentAttachments {
              let addDoc = AddContextDocMutation(
                options: .init(
                  contextId: contextId,
                  docId: docAttach.documentID
                )
              )
              docAttachGroup.enter()
              QLService.shared.client.perform(mutation: addDoc) { result in
                switch result {
                case .success:
                  print("[+] doc \(docAttach.documentID) added to context")
                case let .failure(error):
                  print("[-] addContextDoc failed: \(error)")
                }
                docAttachGroup.leave()
              }
            }

            docAttachGroup.notify(queue: .global()) {
              var contextSnippet = ""
              if !editorData.documentAttachments.isEmpty {
                let sem = DispatchSemaphore(value: 0)
                let matchQuery = MatchContextQuery(
                  contextId: .some(contextId),
                  workspaceId: .some(workspaceId),
                  content: editorData.text,
                  limit: .none,
                  scopedThreshold: .none,
                  threshold: .none
                )
                QLService.shared.client.fetch(query: matchQuery) { result in
                  switch result {
                  case let .success(queryResult):
                    let matches = queryResult.data?.currentUser?.copilot.contexts ?? []
                    let matchDocs = matches.compactMap(\.matchWorkspaceDocs).flatMap(\.self)
                    for context in matchDocs {
                      contextSnippet += "<file docId=\"\(context.docId)\" chunk=\"\(context.chunk)\">\(context.content)</file>\n"
                    }
                  case let .failure(error):
                    print("[-] matchContext failed: \(error)")
                    // self.report(sessionId, error)
                  }
                  sem.signal()
                }
                sem.wait()
              }
              print("[+] context snippet prepared: \(contextSnippet)")
              self.startCopilotResponse(
                editorData: editorData,
                contextSnippet: contextSnippet,
                sessionId: sessionId,
                viewModelId: viewModelId
              )
            }
          }
        case let .failure(error):
          self.report(sessionId, error)
          return
        }
      }
    }
  }

  func startCopilotResponse(
    editorData: InputBoxData,
    contextSnippet: String,
    sessionId: String,
    viewModelId: UUID
  ) {
    assert(!Thread.isMainThread)
    print("[+] starting copilot response for session: \(sessionId)")

    let messageParameters: [String: AnyHashable] = [
      // packages/frontend/core/src/blocksuite/ai/provider/setup-provider.tsx
      "docs": editorData.documentAttachments.map(\.documentID), // affine doc
      "files": [String](), // attachment in context, keep nil for now
      "searchMode": editorData.isSearchEnabled ? "MUST" : "AUTO",
    ]
    let attachmentCount = [
      editorData.fileAttachments.count,
      editorData.imageAttachments.count,
    ].reduce(0, +)
    let attachmentFieldName = attachmentCount > 1 && attachmentCount != 0 ? "options.blobs" : "options.blob"
    let uploadableAttachments: [GraphQLFile] = [
      editorData.fileAttachments.map { file -> GraphQLFile in
        .init(
          fieldName: attachmentFieldName,
          originalName: file.name,
          mimeType: mimeType(text: file.name),
          data: file.data ?? .init()
        )
      },
      editorData.imageAttachments.map { image -> GraphQLFile in
        .init(
          fieldName: attachmentFieldName,
          originalName: "image.jpg",
          mimeType: mimeType(pathExtension: "jpg"),
          data: image.imageData
        )
      },
    ].flatMap(\.self)
    assert(uploadableAttachments.allSatisfy { !($0.data?.isEmpty ?? true) })
    guard let input = try? CreateChatMessageInput(
      attachments: [],
      blob: attachmentCount == 1 ? "" : .none,
      blobs: attachmentCount > 1 && attachmentCount != 0 ? .some([]) : .none,
      content: .some(contextSnippet.isEmpty ? editorData.text : "\(contextSnippet)\n\(editorData.text)"),
      params: .some(AffineGraphQL.JSON(_jsonValue: messageParameters)),
      sessionId: sessionId
    ) else {
      report(sessionId, ChatError.unknownError)
      assertionFailure() // very unlikely to happen
      return
    }
    let mutation = CreateCopilotMessageMutation(options: input)
    QLService.shared.client.upload(operation: mutation, files: uploadableAttachments) { result in
      print("[*] createCopilotMessage result: \(result)")
      DispatchQueue.main.async {
        switch result {
        case let .success(graphQLResult):
          guard let messageIdentifier = graphQLResult.data?.createCopilotMessage else {
            self.report(sessionId, ChatError.invalidResponse)
            self.delete(sessionId: sessionId, vmId: viewModelId)
            return
          }
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

    let closable = ClosableTask(detachedTask: .detached(operation: {
      let eventSource = EventSource()
      let dataTask = eventSource.dataTask(for: request)
      var document = ""
      self.writeMarkdownContent(document + loadingIndicator, sessionId: sessionId, vmId: vmId)
      for await event in dataTask.events() {
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
    let content = MarkdownTextView.PreprocessedContent(parserResult: result, theme: .default)

    with(sessionId: sessionId, vmId: vmId) { (viewModel: inout AssistantMessageCellViewModel) in
      viewModel.content = document
      viewModel.preprocessedContent = content
    }
  }
}
