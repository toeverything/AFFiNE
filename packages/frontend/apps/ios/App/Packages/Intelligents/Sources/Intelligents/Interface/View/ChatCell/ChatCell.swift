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

  private lazy var avatarImageView = UIImageView().then {
    $0.contentMode = .scaleAspectFit
    $0.layer.cornerRadius = 16
    $0.layer.cornerCurve = .continuous
    $0.clipsToBounds = true
    $0.backgroundColor = .systemGray5
  }

  private lazy var messageContainerView = UIView().then {
    $0.layer.cornerRadius = 12
    $0.layer.cornerCurve = .continuous
  }

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
  }

  private lazy var timestampLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .systemGray
    $0.textAlignment = .right
  }

  private lazy var stackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .top
  }

  private lazy var messageStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 4
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

    contentView.addSubview(stackView)

    messageStackView.addArrangedSubview(messageContainerView)
    messageStackView.addArrangedSubview(timestampLabel)

    messageContainerView.addSubview(messageLabel)

    stackView.addArrangedSubview(avatarImageView)
    stackView.addArrangedSubview(messageStackView)

    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(16)
    }

    avatarImageView.snp.makeConstraints { make in
      make.size.equalTo(32)
    }

    messageLabel.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(12)
    }

    messageStackView.snp.makeConstraints { make in
      make.width.lessThanOrEqualTo(250)
    }
  }

  // MARK: - Configuration

  func configure(with message: ChatMessage) {
    self.message = message

    messageLabel.text = message.content

    if let createdDate = message.createdDate {
      let formatter = DateFormatter()
      formatter.dateStyle = .none
      formatter.timeStyle = .short
      timestampLabel.text = formatter.string(from: createdDate)
    } else {
      timestampLabel.text = ""
    }

    switch message.role {
    case .user:
      configureUserMessage()
    case .assistant:
      configureAssistantMessage()
    case .system:
      configureSystemMessage()
    }
  }

  private func configureUserMessage() {
    // User message - align to right
    stackView.semanticContentAttribute = .forceRightToLeft
    messageContainerView.backgroundColor = .systemBlue
    messageLabel.textColor = .white
    avatarImageView.image = UIImage(systemName: "person.circle.fill")
    avatarImageView.tintColor = .systemBlue
    timestampLabel.textAlignment = .left
  }

  private func configureAssistantMessage() {
    // Assistant message - align to left
    stackView.semanticContentAttribute = .forceLeftToRight
    messageContainerView.backgroundColor = .systemGray6
    messageLabel.textColor = .label
    avatarImageView.image = UIImage(systemName: "brain.head.profile")
    avatarImageView.tintColor = .systemPurple
    timestampLabel.textAlignment = .right
  }

  private func configureSystemMessage() {
    // System message - center aligned
    stackView.semanticContentAttribute = .forceLeftToRight
    messageContainerView.backgroundColor = .systemYellow.withAlphaComponent(0.3)
    messageLabel.textColor = .label
    avatarImageView.image = UIImage(systemName: "gear")
    avatarImageView.tintColor = .systemOrange
    timestampLabel.textAlignment = .center
  }
}
