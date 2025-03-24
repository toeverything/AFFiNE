//
//  IntelligentsChatController.swift
//
//
//  Created by 秋星桥 on 2024/11/18.
//

import Combine
import LDSwiftEventSource
import OrderedCollections
import UIKit

public class IntelligentsChatController: UIViewController {
  let header = Header()
  let inputBox = InputBox()
  let progressView = UIActivityIndicatorView()

  let publisher = PassthroughSubject<MessageListView.ElementPublisher.Output, Never>()
  lazy var tableView = MessageListView(dataPublisher: publisher.eraseToAnyPublisher())

  var inputBoxKeyboardAdapterHeightConstraint = NSLayoutConstraint()

  enum ChatContent {
    case user(document: String)
    case assistant(document: String)
    case error(text: String)
  }

  var simpleChatContents: OrderedDictionary<UUID, ChatContent> = [:] {
    didSet { updateContentToPublisher() }
  }

  var sessionID: String = "" {
    didSet { print("[*] new sessionID: \(sessionID)") }
  }

  public enum MetadataKey: String {
    case documentID
    case workspaceID
    case content
  }

  public var metadata: [MetadataKey: String] = [:]

  var chatTask: EventSource?

  override public var title: String? {
    set {
      super.title = newValue
      header.titleLabel.text = newValue
    }
    get {
      super.title
    }
  }

  public init() {
    super.init(nibName: nil, bundle: nil)
    title = "Chat with AI".localized()

    overrideUserInterfaceStyle = .dark
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  deinit {
    chatTask?.stop()
    chatTask = nil
  }

  override public func viewDidLoad() {
    super.viewDidLoad()
    assert(navigationController != nil)
    view.backgroundColor = .secondarySystemBackground

    hideKeyboardWhenTappedAround()

    view.addSubview(header)
    view.addSubview(tableView)
    view.addSubview(inputBox)
    view.addSubview(progressView)
    setupLayout()

    // TODO: IMPL
    inputBox.editor.controlBanner.cameraButton.isHidden = true
    inputBox.editor.controlBanner.photoButton.isHidden = true

    chat_onLoad()
  }

  override public func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    chatTask?.stop()
    chatTask = nil
  }

  func setupLayout() {
    header.translatesAutoresizingMaskIntoConstraints = false
    [
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      header.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 44),
    ].forEach { $0.isActive = true }

    inputBox.translatesAutoresizingMaskIntoConstraints = false
    [
      inputBox.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      inputBox.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      inputBox.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
    ].forEach { $0.isActive = true }

    tableView.translatesAutoresizingMaskIntoConstraints = false
    [
      tableView.topAnchor.constraint(equalTo: header.bottomAnchor),
      tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      tableView.bottomAnchor.constraint(equalTo: inputBox.topAnchor),
    ].forEach { $0.isActive = true }

    inputBox.editor.controlBanner.sendButton.addTarget(
      self,
      action: #selector(chat_onSend),
      for: .touchUpInside
    )

    progressView.hidesWhenStopped = true
    progressView.stopAnimating()
    progressView.translatesAutoresizingMaskIntoConstraints = false
    [
      progressView.centerXAnchor.constraint(equalTo: inputBox.centerXAnchor),
      progressView.centerYAnchor.constraint(equalTo: inputBox.centerYAnchor),
    ].forEach { $0.isActive = true }
    progressView.style = .large
  }
}
