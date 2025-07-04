//
//  SystemMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class SystemMessageCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var iconView = UIImageView().then {
    $0.image = UIImage(systemName: "info.circle.fill")
    $0.tintColor = .systemOrange
    $0.contentMode = .scaleAspectFit
  }

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 14, weight: .medium)
    $0.textColor = .label
  }

  private lazy var timestampLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 12)
    $0.textColor = .secondaryLabel
    $0.textAlignment = .right
  }

  private lazy var contentStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .top
  }

  private lazy var textStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 4
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: SystemMessageCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(contentStackView)

    contentStackView.addArrangedSubview(iconView)
    contentStackView.addArrangedSubview(textStackView)

    textStackView.addArrangedSubview(messageLabel)
    textStackView.addArrangedSubview(timestampLabel)

    contentStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    iconView.snp.makeConstraints { make in
      make.width.height.equalTo(20)
    }
  }

  // MARK: - Configuration

  override func configure(with viewModel: any ChatCellViewModel) {
    guard let systemViewModel = viewModel as? SystemMessageCellViewModel else { return }
    self.viewModel = systemViewModel

    messageLabel.text = systemViewModel.content
    configureContainer(backgroundColor: backgroundColor(for: systemViewModel.cellType))

    // 配置时间戳
    if let timestamp = systemViewModel.timestamp {
      timestampLabel.text = formatTimestamp(timestamp)
      timestampLabel.isHidden = false
    } else {
      timestampLabel.isHidden = true
    }
  }

  // MARK: - Helpers

  private func formatTimestamp(_ timestamp: Date) -> String {
    let formatter = DateFormatter()
    formatter.timeStyle = .short
    return formatter.string(from: timestamp)
  }
}
