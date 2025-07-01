//
//  LoadingCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class LoadingCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var activityIndicator = UIActivityIndicatorView().then {
    $0.style = .medium
    $0.hidesWhenStopped = false
  }

  private lazy var messageLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 14)
    $0.textColor = .secondaryLabel
    $0.textAlignment = .center
  }

  private lazy var progressView = UIProgressView().then {
    $0.progressViewStyle = .default
    $0.trackTintColor = .systemGray5
    $0.progressTintColor = .systemBlue
  }

  private lazy var stackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 12
    $0.alignment = .center
  }

  // MARK: - Properties

  private var viewModel: LoadingCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(stackView)

    stackView.addArrangedSubview(activityIndicator)
    stackView.addArrangedSubview(messageLabel)
    stackView.addArrangedSubview(progressView)

    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    progressView.snp.makeConstraints { make in
      make.leading.trailing.equalToSuperview()
      make.height.equalTo(4)
    }

    activityIndicator.startAnimating()
  }

  // MARK: - Configuration

  override func configure(with viewModel: any ChatCellViewModel) {
    guard let loadingViewModel = viewModel as? LoadingCellViewModel else { return }
    self.viewModel = loadingViewModel

    configureContainer(backgroundColor: backgroundColor(for: loadingViewModel.cellType))

    // 配置消息
    if let message = loadingViewModel.message {
      messageLabel.text = message
      messageLabel.isHidden = false
    } else {
      messageLabel.text = "Processing..."
      messageLabel.isHidden = false
    }

    // 配置进度
    if let progress = loadingViewModel.progress {
      progressView.progress = Float(progress)
      progressView.isHidden = false
    } else {
      progressView.isHidden = true
    }
  }
}
