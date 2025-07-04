//
//  ErrorCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class ErrorCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var iconView = UIImageView().then {
    $0.image = UIImage(systemName: "exclamationmark.triangle.fill")
    $0.tintColor = .systemRed
    $0.contentMode = .scaleAspectFit
  }

  private lazy var errorLabel = UILabel().then {
    $0.numberOfLines = 0
    $0.font = .systemFont(ofSize: 14, weight: .medium)
    $0.textColor = .systemRed
  }

  private lazy var retryButton = UIButton(type: .system).then {
    $0.setTitle("Retry", for: .normal)
    $0.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
    $0.setTitleColor(.systemBlue, for: .normal)
    $0.backgroundColor = .systemBlue.withAlphaComponent(0.1)
    $0.layer.cornerRadius = 8
    $0.layer.cornerCurve = .continuous
    $0.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
  }

  private lazy var contentStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .top
  }

  private lazy var textStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 12
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: ErrorCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(contentStackView)

    contentStackView.addArrangedSubview(iconView)
    contentStackView.addArrangedSubview(textStackView)

    textStackView.addArrangedSubview(errorLabel)
    textStackView.addArrangedSubview(retryButton)

    contentStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }

    iconView.snp.makeConstraints { make in
      make.width.height.equalTo(24)
    }

    retryButton.addTarget(self, action: #selector(retryButtonTapped), for: .touchUpInside)
  }

  // MARK: - Configuration

  override func configure(with viewModel: any ChatCellViewModel) {
    guard let errorViewModel = viewModel as? ErrorCellViewModel else {
      assertionFailure()
      return
    }
    self.viewModel = errorViewModel

    errorLabel.text = errorViewModel.errorMessage
    configureContainer(
      backgroundColor: backgroundColor(for: errorViewModel.cellType),
      borderColor: .systemRed.withAlphaComponent(0.3),
      borderWidth: 1
    )
  }

  // MARK: - Actions

  @objc private func retryButtonTapped() {
    // TODO: 实现重试逻辑
  }
}
