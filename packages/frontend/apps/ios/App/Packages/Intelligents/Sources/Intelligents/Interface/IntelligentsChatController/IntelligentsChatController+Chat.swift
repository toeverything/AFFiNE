//
//  IntelligentsChatController+Chat.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/12/26.
//

import AffineGraphQL
import LDSwiftEventSource
import MarkdownParser
import UIKit

extension IntelligentsChatController {
  @objc func chat_onLoad() {
    beginProgress()
    chat_createSession { session in
      self.sessionID = session ?? ""
      self.chat_retrieveHistories {
        self.dispatchToMain {
          self.endProgress()
        }
      }
    } onFailure: { error in
      self.presentError(error) {
        if let nav = self.navigationController {
          nav.popViewController(animated: true)
        } else {
          self.dismiss(animated: true)
        }
      }
    }
  }

  @objc func chat_onSend() {
    beginProgress()
    let viewModel = inputBox.editor.viewModel.duplicate()
    viewModel.text = viewModel.text.trimmingCharacters(in: .whitespacesAndNewlines)
    inputBox.editor.viewModel.reset()
    inputBox.editor.updateValues()
    DispatchQueue.global().async {
      self.chat_onSendExecute(viewModel: viewModel)
      self.endProgress()
    }
  }

  func chat_clearHistory() {
    beginProgress()
    Intelligents.qlClient.perform(mutation: CleanupCopilotSessionMutation(input: .init(
      docId: metadata[.documentID] ?? "",
      sessionIds: [sessionID],
      workspaceId: metadata[.workspaceID] ?? ""
    ))) { result in
      self.dispatchToMain {
        self.endProgress()
        if case let .success(value) = result,
           let sessions = value.data?.cleanupCopilotSession,
           sessions.contains(self.sessionID)
        {
          self.simpleChatContents.removeAll()
          return
        }
        self.presentError(UnableTo.clearHistory)
      }
    }
  }

  func chat_retrieveHistories(_ completion: @escaping () -> Void) {
    Intelligents.qlClient.fetch(query: GetCopilotHistoriesQuery(
      workspaceId: metadata[.workspaceID] ?? "",
      docId: .init(stringLiteral: metadata[.documentID] ?? ""),
      options: .some(.init(
        action: false,
        fork: false,
        limit: .init(nilLiteral: ()),
        messageOrder: .some(.case(.asc)),
        sessionId: .init(stringLiteral: sessionID),
        sessionOrder: .some(.case(.desc)),
        skip: .init(nilLiteral: ()),
        withPrompt: .init(booleanLiteral: false)
      ))
    )) { [weak self] result in
      if let self,
         case let .success(value) = result,
         let object = value.data,
         let currentUser = object.__data._data["currentUser"] as? DataDict,
         let copilot = currentUser._data["copilot"] as? DataDict,
         let histories = copilot._data["histories"] as? [DataDict],
         let mostRecent = histories.first,
         let messages = mostRecent._data["messages"] as? [DataDict],
         !messages.isEmpty
      {
        print("[*] retrieved \(messages.count) messages")
        tableView.scrollToBottomOnNextUpdate = true
        tableView.alpha = 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          UIView.animate(withDuration: 0.5, delay: 0, usingSpringWithDamping: 1.0, initialSpringVelocity: 0.8) {
            self.tableView.alpha = 1
          }
        }
        for message in messages {
          guard let role = message._data["role"] as? String,
                let content = message._data["content"] as? String
          // TODO: ATTACHMENTS
          else { continue }
          switch role {
          case "assistant":
            simpleChatContents.updateValue(
              .assistant(document: content),
              forKey: UUID()
            )
          case "user":
            simpleChatContents.updateValue(
              .user(document: content),
              forKey: UUID()
            )
          default:
            assertionFailure()
          }
        }
      }
      completion()
    }
  }
}

private extension IntelligentsChatController {
  func dispatchToMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }

  func beginProgress() {
    dispatchToMain { [self] in
      header.isUserInteractionEnabled = false
      inputBox.isUserInteractionEnabled = false
      progressView.isHidden = false
      progressView.alpha = 0
      progressView.startAnimating()
      UIView.animate(withDuration: 0.25) {
        self.inputBox.editor.alpha = 0
        self.progressView.alpha = 1
      }
    }
  }

  func endProgress() {
    dispatchToMain { [self] in
      UIView.animate(withDuration: 0.3) {
        self.inputBox.editor.alpha = 1
        self.progressView.alpha = 0
        self.header.isUserInteractionEnabled = true
      } completion: { _ in
        self.inputBox.isUserInteractionEnabled = true
        self.progressView.stopAnimating()
      }
    }
  }
}

private extension IntelligentsChatController {
  func chat_onError(_ error: Error) {
    print("[*] chat error", error)
    dispatchToMain {
      let key = UUID()
      let content = ChatContent.error(text: error.localizedDescription)
      self.simpleChatContents.updateValue(content, forKey: key)
    }
  }

  func chat_createSession(
    forceCreateNewSession: Bool = false,
    onSuccess: @escaping (String?) -> Void,
    onFailure: @escaping (Error) -> Void
  ) {
    if !forceCreateNewSession,
       let doc = metadata[.documentID],
       !doc.isEmpty
    {
      Intelligents.qlClient.fetch(query: GetCopilotSessionsQuery(
        workspaceId: .init(stringLiteral: metadata[.workspaceID] ?? ""),
        docId: .init(stringLiteral: doc),
        options: .some(QueryChatSessionsInput(InputDict([
          "action": false,
        ])))
      )) { result in
        switch result {
        case let .success(value):
          if let result = value.data,
             let currentUser = result.__data._data["currentUser"] as? DataDict,
             let copilot = currentUser._data["copilot"] as? DataDict,
             let sessions = copilot._data["sessions"] as? [DataDict],
             let mostRecent = sessions.last,
             let sessionID = mostRecent._data["id"] as? String
          {
            print("[*] using existing session", sessionID)
            self.dispatchToMain { onSuccess(sessionID) }
            return
          }
          self.chat_createSession(
            forceCreateNewSession: true,
            onSuccess: onSuccess,
            onFailure: onFailure
          )
        case let .failure(error):
          self.dispatchToMain { onFailure(error) }
        }
      }
    }
    Intelligents.qlClient.perform(
      mutation: CreateCopilotSessionMutation(options: .init(
        docId: metadata[.documentID] ?? "",
        promptName: Prompt.general_Chat_With_AFFiNE_AI.rawValue,
        workspaceId: metadata[.workspaceID] ?? ""
      )),
      queue: .global()
    ) { result in
      switch result {
      case let .success(value):
        if let session = value.data?.createCopilotSession {
          self.dispatchToMain { onSuccess(session) }
        } else {
          self.dispatchToMain {
            onFailure(UnableTo.createSession)
          }
        }
      case let .failure(error):
        self.dispatchToMain { onFailure(error) }
      }
    }
  }

  func chat_onSendExecute(viewModel: InputEditView.ViewModel) {
    let text = viewModel.text
    //    let images = viewModel.attachments

    let assistantContentID = UUID()
    dispatchToMain {
      let content = ChatContent.user(document: text)
      self.simpleChatContents.updateValue(content, forKey: .init())
      self.simpleChatContents.updateValue(
        .assistant(document: "..."),
        forKey: assistantContentID
      )
      self.tableView.scrollToBottomOnNextUpdate = true
    }

    let sem = DispatchSemaphore(value: 0)
    let sessionID = sessionID
    Intelligents.qlClient.perform(
      mutation: CreateCopilotMessageMutation(options: .init(
        content: .init(stringLiteral: text),
        params: .some(.dictionary([
          "docs": [
            "docId": metadata[.documentID] ?? "",
            "docContent": metadata[.content] ?? "",
          ],
        ])),
        sessionId: sessionID
      )),
      queue: .global()
    ) { result in
      defer { sem.signal() }
      switch result {
      case let .success(value):
        if let messageID = value.data?.createCopilotMessage {
          print("[*] messageID", messageID)
          self.chat_processWithMessageID(
            sessionID: sessionID,
            messageID: messageID,
            cellID: assistantContentID
          )
        } else {
          self.chat_onError(UnableTo.createMessage)
        }
      case let .failure(error):
        self.chat_onError(error)
      }
    }

    sem.wait()
  }

  func chat_processWithMessageID(sessionID: String, messageID: String, cellID: UUID) {
    let url = Constant.affineUpstreamURL
      .appendingPathComponent("api")
      .appendingPathComponent("copilot")
      .appendingPathComponent("chat")
      .appendingPathComponent(sessionID)
      .appendingPathComponent("stream")
    var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
    comps?.queryItems = [URLQueryItem(name: "messageId", value: messageID)]

    guard let url = comps?.url else {
      assertionFailure()
      chat_onError(UnableTo.createMessage)
      return
    }

    dispatchToMain {
      self.simpleChatContents.updateValue(
        .assistant(document: "..."),
        forKey: cellID
      )
    }

    let sem = DispatchSemaphore(value: 0)

    let eventHandler = BlockEventHandler()
    eventHandler.onOpenedBlock = {
      print("[*] chat opened")
    }
    eventHandler.onClosedBlock = {
      sem.signal()
      self.chatTask?.stop()
      self.chatTask = nil
    }
    eventHandler.onErrorBlock = { error in
      self.chat_onError(error)
    }

    var document = ""
    eventHandler.onMessageBlock = { _, message in
      self.dispatchToMain {
        document += message.data
        let content = ChatContent.assistant(document: document)
        self.simpleChatContents.updateValue(content, forKey: cellID)
      }
    }
    let eventSource = EventSource(config: .init(handler: eventHandler, url: url))
    chatTask = eventSource
    eventSource.start()

    sem.wait()
  }
}

extension IntelligentsChatController {
  func updateContentToPublisher() {
    assert(Thread.isMainThread)
    let copy = simpleChatContents
    let input: [MessageListView.Element] = copy.map { key, value in
      switch value {
      case let .assistant(document):
        let nodes = MarkdownParser().feed(document)
        return .init(
          id: key,
          cell: .assistant,
          viewModel: MessageListView.AssistantCell.ViewModel(blocks: nodes),
          object: nil
        )
      case let .user(document):
        return .init(
          id: key,
          cell: .user,
          viewModel: MessageListView.UserCell.ViewModel(text: document),
          object: nil
        )
      case let .error(text):
        return .init(
          id: key,
          cell: .hint,
          viewModel: MessageListView.HintCell.ViewModel(hint: text),
          object: nil
        )
      }
    }
    publisher.send(input)
  }
}
