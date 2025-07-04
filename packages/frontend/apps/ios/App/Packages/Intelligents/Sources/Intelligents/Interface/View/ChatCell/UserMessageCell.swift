//
//  UserMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class UserMessageCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
  }

  private lazy var timestampLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .secondaryLabel
    $0.textAlignment = .right
  }

  private lazy var retryIndicator = UIActivityIndicatorView().then {
    $0.style = .medium
    $0.hidesWhenStopped = true
  }

  private lazy var stackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 8
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: UserMessageCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(stackView)
    stackView.addArrangedSubview(messageLabel)

    let bottomContainer = UIView()
    stackView.addArrangedSubview(bottomContainer)

    bottomContainer.addSubview(retryIndicator)
    bottomContainer.addSubview(timestampLabel)

    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    retryIndicator.snp.makeConstraints { make in
      make.leading.centerY.equalToSuperview()
      make.width.height.equalTo(16)
    }

    timestampLabel.snp.makeConstraints { make in
      make.trailing.top.bottom.equalToSuperview()
      make.leading.greaterThanOrEqualTo(retryIndicator.snp.trailing).offset(8)
    }

    bottomContainer.snp.makeConstraints { make in
      make.height.equalTo(16)
    }
  }

  // MARK: - Configuration

  override func configure(with viewModel: any ChatCellViewModel) {
    guard let userViewModel = viewModel as? UserMessageCellViewModel else { return }
    self.viewModel = userViewModel

    messageLabel.text = userViewModel.content
    configureContainer(backgroundColor: backgroundColor(for: userViewModel.cellType))

    let timestamp = userViewModel.timestamp
    timestampLabel.text = formatTimestamp(timestamp)
    timestampLabel.isHidden = false
  }

  // MARK: - Helpers

  private func formatTimestamp(_ timestamp: Date) -> String {
    let formatter = DateFormatter()
    formatter.timeStyle = .short
    return formatter.string(from: timestamp)
  }
}
