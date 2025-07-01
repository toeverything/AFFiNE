//
//  AssistantMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class AssistantMessageCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
  }

  private lazy var metadataStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 8
    $0.alignment = .center
  }

  private lazy var modelLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12, weight: .medium)
    $0.textColor = .secondaryLabel
  }

  private lazy var tokensLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .secondaryLabel
  }

  private lazy var timestampLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .secondaryLabel
  }

  private lazy var streamingIndicator = UIActivityIndicatorView().then {
    $0.style = .medium
    $0.hidesWhenStopped = true
  }

  private lazy var retryButton = UIButton(type: .system).then {
    $0.setTitle("重试", for: .normal)
    $0.titleLabel?.font = .systemFont(ofSize: 12)
    $0.setTitleColor(.systemBlue, for: .normal)
  }

  private lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 8
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: AssistantMessageCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(mainStackView)

    mainStackView.addArrangedSubview(messageLabel)
    mainStackView.addArrangedSubview(metadataStackView)

    metadataStackView.addArrangedSubview(modelLabel)
    metadataStackView.addArrangedSubview(tokensLabel)
    metadataStackView.addArrangedSubview(UIView()) // Spacer
    metadataStackView.addArrangedSubview(streamingIndicator)
    metadataStackView.addArrangedSubview(retryButton)
    metadataStackView.addArrangedSubview(timestampLabel)

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    retryButton.addTarget(self, action: #selector(retryButtonTapped), for: .touchUpInside)
  }

  // MARK: - Configuration

  override func configure(with viewModel: any ChatCellViewModel) {
    guard let assistantViewModel = viewModel as? AssistantMessageCellViewModel else { return }
    self.viewModel = assistantViewModel

    messageLabel.text = assistantViewModel.content
    configureContainer(backgroundColor: backgroundColor(for: assistantViewModel.cellType))

    // 配置模型信息
    if let model = assistantViewModel.model {
      modelLabel.text = model
      modelLabel.isHidden = false
    } else {
      modelLabel.isHidden = true
    }

    // 配置 tokens 信息
    if let tokens = assistantViewModel.tokens {
      tokensLabel.text = "\(tokens) tokens"
      tokensLabel.isHidden = false
    } else {
      tokensLabel.isHidden = true
    }

    // 配置时间戳
    let timestamp = assistantViewModel.timestamp
    timestampLabel.text = formatTimestamp(timestamp)
    timestampLabel.isHidden = false

    // 配置流式状态
    if assistantViewModel.isStreaming {
      streamingIndicator.startAnimating()
    } else {
      streamingIndicator.stopAnimating()
    }

    // 配置重试按钮
    retryButton.isHidden = !assistantViewModel.canRetry
  }

  // MARK: - Actions

  @objc private func retryButtonTapped() {
    // TODO: 实现重试逻辑
  }

  // MARK: - Helpers

  private func formatTimestamp(_ timestamp: Date) -> String {
    let formatter = DateFormatter()
    formatter.timeStyle = .short
    return formatter.string(from: timestamp)
  }
}
