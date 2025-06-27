//
//  ChatCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import SnapKit
import Then
import UIKit

class ChatCell: UITableViewCell {
  // MARK: - UI Components

  private lazy var messageContainerView = UIView().then {
    $0.layer.cornerRadius = 8
    $0.layer.cornerCurve = .continuous
  }

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
  }

  // MARK: - Properties

  private var message: ChatMessage?

  // MARK: - Initialization

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupUI() {
    backgroundColor = .clear
    selectionStyle = .none

    contentView.addSubview(messageContainerView)
    messageContainerView.addSubview(messageLabel)

    messageContainerView.snp.makeConstraints { make in
      make.top.bottom.equalToSuperview().inset(8)
      make.leading.trailing.equalToSuperview().inset(16)
    }

    messageLabel.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(12)
    }
  }

  // MARK: - Configuration

  func configure(with message: ChatMessage) {
    self.message = message
    messageLabel.text = message.content

    switch message.role {
    case .user:
      configureUserMessage()
    case .assistant:
      configureAssistantMessage()
    case .system:
      configureSystemMessage()
    case .error:
      configureErrorMessage()
    }
  }

  private func configureUserMessage() {
    // User message - no background, default text color
    messageContainerView.backgroundColor = .clear
    messageLabel.textColor = .label
  }

  private func configureAssistantMessage() {
    // Assistant message - no background, default text color
    messageContainerView.backgroundColor = .clear
    messageLabel.textColor = .label
  }

  private func configureSystemMessage() {
    // System message - with background for visibility
    messageContainerView.backgroundColor = .systemYellow.withAlphaComponent(0.2)
    messageLabel.textColor = .label
  }

  private func configureErrorMessage() {
    // Error message - with background for visibility
    messageContainerView.backgroundColor = .systemRed.withAlphaComponent(0.1)
    messageLabel.textColor = .systemRed
  }
}
