//
//  ChatListView.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Combine
import SnapKit
import Then
import UIKit

class ChatListView: UIView {
  // MARK: - UI Components

  lazy var tableView = UITableView().then {
    $0.backgroundColor = .clear
    $0.separatorStyle = .none
    $0.delegate = self
    $0.dataSource = self
    $0.register(ChatCell.self, forCellReuseIdentifier: "ChatCell")
    $0.keyboardDismissMode = .interactive
    $0.contentInsetAdjustmentBehavior = .never
  }

  lazy var emptyStateView = UIView().then {
    $0.isHidden = true
  }

  lazy var emptyStateLabel = UILabel().then {
    $0.text = "Start a conversation..."
    $0.font = .systemFont(ofSize: 18, weight: .medium)
    $0.textColor = .systemGray
    $0.textAlignment = .center
  }

  // MARK: - Properties

  private var messages: [ChatMessage] = []
  private var cancellables = Set<AnyCancellable>()
  private let chatManager = ChatManager.shared

  // MARK: - Initialization

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupUI()
    setupBindings()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupUI() {
    backgroundColor = .affineLayerBackgroundPrimary

    addSubview(tableView)
    addSubview(emptyStateView)
    emptyStateView.addSubview(emptyStateLabel)

    tableView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    emptyStateView.snp.makeConstraints { make in
      make.center.equalToSuperview()
      make.width.lessThanOrEqualToSuperview().inset(32)
    }

    emptyStateLabel.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }
  }

  private func setupBindings() {
    // Listen to current session changes
    chatManager.$currentSession
      .receive(on: DispatchQueue.main)
      .sink { [weak self] session in
        self?.updateMessages(for: session?.id)
      }
      .store(in: &cancellables)

    // Listen to messages changes
    chatManager.$messages
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        if let sessionId = self?.chatManager.currentSession?.id {
          self?.updateMessages(for: sessionId)
        }
      }
      .store(in: &cancellables)
  }

  private func updateMessages(for sessionId: String?) {
    guard let sessionId else {
      messages = []
      updateEmptyState()
      tableView.reloadData()
      return
    }

    messages = chatManager.messages[sessionId] ?? []
    updateEmptyState()
    tableView.reloadData()

    // Scroll to bottom for new messages
    if !messages.isEmpty {
      let indexPath = IndexPath(row: messages.count - 1, section: 0)
      tableView.scrollToRow(at: indexPath, at: .bottom, animated: true)
    }
  }

  private func updateEmptyState() {
    emptyStateView.isHidden = !messages.isEmpty
    tableView.isHidden = messages.isEmpty
  }
}

// MARK: - UITableViewDataSource

extension ChatListView: UITableViewDataSource {
  func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
    messages.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "ChatCell", for: indexPath) as! ChatCell
    let message = messages[indexPath.row]
    cell.configure(with: message)
    return cell
  }
}

// MARK: - UITableViewDelegate

extension ChatListView: UITableViewDelegate {
  func tableView(_: UITableView, heightForRowAt _: IndexPath) -> CGFloat {
    UITableView.automaticDimension
  }

  func tableView(_: UITableView, estimatedHeightForRowAt _: IndexPath) -> CGFloat {
    60
  }
}
