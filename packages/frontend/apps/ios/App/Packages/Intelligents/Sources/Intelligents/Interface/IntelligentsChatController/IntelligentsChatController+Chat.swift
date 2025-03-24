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
      self.endProgress()
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
    onSuccess: @escaping (String?) -> Void,
    onFailure: @escaping (Error) -> Void
  ) {
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
            onFailure(
              NSError(
                domain: "Intelligents",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "No session created"]
              )
            )
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

    dispatchToMain {
      let content = ChatContent.user(document: text)
      let key = UUID()
      self.simpleChatContents.updateValue(content, forKey: key)
      self.tableView.scrollLastCellToTop()
    }

    let sem = DispatchSemaphore(value: 0)
    let sessionID = sessionID
    Intelligents.qlClient.perform(
      mutation: CreateCopilotMessageMutation(options: .init(
        content: .init(stringLiteral: text),
        sessionId: sessionID
      )),
      queue: .global()
    ) { result in
      defer { sem.signal() }
      switch result {
      case let .success(value):
        if let messageID = value.data?.createCopilotMessage {
          print("[*] messageID", messageID)
          self.chat_processWithMessageID(sessionID: sessionID, messageID: messageID)
        } else {
          self.chat_onError(NSError(
            domain: "Intelligents",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "No message created"]
          ))
        }
      case let .failure(error):
        self.chat_onError(error)
      }
    }

    sem.wait()
  }

  func chat_processWithMessageID(sessionID: String, messageID: String) {
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
      chat_onError(NSError(
        domain: "Intelligents",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "No message created"]
      ))
      return
    }

    let contentIdentifier = UUID()
    dispatchToMain {
      self.simpleChatContents.updateValue(
        .assistant(document: "..."),
        forKey: contentIdentifier
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
        self.simpleChatContents.updateValue(content, forKey: contentIdentifier)
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
