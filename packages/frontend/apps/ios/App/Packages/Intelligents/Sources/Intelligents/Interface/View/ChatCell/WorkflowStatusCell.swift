//
//  WorkflowStatusCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class WorkflowStatusCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var iconView = UIImageView().then {
    $0.tintColor = .systemBlue
    $0.contentMode = .scaleAspectFit
  }

  private lazy var titleLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 14, weight: .semibold)
    $0.textColor = .systemBlue
    $0.numberOfLines = 1
  }

  private lazy var statusLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .secondaryLabel
    $0.numberOfLines = 0
  }

  private lazy var progressView = UIProgressView().then {
    $0.progressViewStyle = .default
    $0.trackTintColor = .systemGray5
    $0.progressTintColor = .systemBlue
  }

  private lazy var timestampLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 11)
    $0.textColor = .tertiaryLabel
    $0.textAlignment = .right
  }

  private lazy var contentStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .top
  }

  private lazy var textStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 6
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: WorkflowStatusCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(contentStackView)

    contentStackView.addArrangedSubview(iconView)
    contentStackView.addArrangedSubview(textStackView)

    textStackView.addArrangedSubview(titleLabel)
    textStackView.addArrangedSubview(statusLabel)
    textStackView.addArrangedSubview(progressView)
    textStackView.addArrangedSubview(timestampLabel)

    contentStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    iconView.snp.makeConstraints { make in
      make.width.height.equalTo(20)
    }

    progressView.snp.makeConstraints { make in
      make.height.equalTo(4)
    }
  }

  // MARK: - Configuration

  override func configure(with viewModel: ChatCellViewModel) {
    guard let workflowViewModel = viewModel as? WorkflowStatusCellViewModel else { return }
    self.viewModel = workflowViewModel

    let workflow = workflowViewModel.workflow

    configureContainer(backgroundColor: backgroundColor(for: workflowViewModel.cellType))

    // 配置标题和状态
    titleLabel.text = workflow.title
    statusLabel.text = workflow.content

    // 配置图标和颜色
    configureWorkflowAppearance(for: workflow.status)

    // 配置进度
    if let progress = workflow.progress {
      progressView.progress = Float(progress)
      progressView.isHidden = false
    } else {
      progressView.isHidden = true
    }

    // 配置时间戳
    if let timestamp = workflow.timestamp {
      timestampLabel.text = formatTimestamp(timestamp)
      timestampLabel.isHidden = false
    } else {
      timestampLabel.isHidden = true
    }
  }

  // MARK: - Helpers

  private func configureWorkflowAppearance(for status: String) {
    switch status.lowercased() {
    case "running", "processing":
      iconView.image = UIImage(systemName: "gear.circle.fill")
      iconView.tintColor = .systemBlue
      titleLabel.textColor = .systemBlue
      progressView.progressTintColor = .systemBlue

    case "completed", "success":
      iconView.image = UIImage(systemName: "checkmark.circle.fill")
      iconView.tintColor = .systemGreen
      titleLabel.textColor = .systemGreen
      progressView.progressTintColor = .systemGreen

    case "failed", "error":
      iconView.image = UIImage(systemName: "xmark.circle.fill")
      iconView.tintColor = .systemRed
      titleLabel.textColor = .systemRed
      progressView.progressTintColor = .systemRed

    case "waiting", "pending":
      iconView.image = UIImage(systemName: "clock.circle.fill")
      iconView.tintColor = .systemOrange
      titleLabel.textColor = .systemOrange
      progressView.progressTintColor = .systemOrange

    default:
      iconView.image = UIImage(systemName: "info.circle.fill")
      iconView.tintColor = .systemBlue
      titleLabel.textColor = .systemBlue
      progressView.progressTintColor = .systemBlue
    }
  }

  private func formatTimestamp(_ timestamp: Date) -> String {
    let formatter = DateFormatter()
    formatter.timeStyle = .short
    return formatter.string(from: timestamp)
  }
}
