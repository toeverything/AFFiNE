//
//  ContextReferenceCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class ContextReferenceCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var titleLabel = UILabel().then {
    $0.text = "Context Reference"
    $0.font = .systemFont(ofSize: 14, weight: .semibold)
    $0.textColor = .systemGreen
  }

  private lazy var referencesStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 8
    $0.alignment = .fill
  }

  private lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 12
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: ContextReferenceCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(mainStackView)

    mainStackView.addArrangedSubview(titleLabel)
    mainStackView.addArrangedSubview(referencesStackView)

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }
  }

  // MARK: - Configuration

  override func configure(with viewModel: ChatCellViewModel) {
    guard let contextViewModel = viewModel as? ContextReferenceCellViewModel else { return }
    self.viewModel = contextViewModel

    configureContainer(backgroundColor: backgroundColor(for: contextViewModel.cellType))

    // 清除旧的引用视图
    referencesStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

    // 添加新的引用视图
//    for reference in contextViewModel.references {
//      let referenceView = createReferenceView(for: reference)
//      referencesStackView.addArrangedSubview(referenceView)
//    }
  }

  // MARK: - Helpers

//  private func createReferenceView(for reference: ChatManager.ContextReference) -> UIView {
//    let containerView = UIView().then {
//      $0.backgroundColor = .systemGray6
//      $0.layer.cornerRadius = 8
//      $0.layer.cornerCurve = .continuous
//    }
//
//    let iconView = UIImageView().then {
//      $0.image = UIImage(systemName: "link.circle.fill")
//      $0.tintColor = .systemGreen
//      $0.contentMode = .scaleAspectFit
//    }
//
//    let titleLabel = UILabel().then {
//      $0.text = reference.title ?? "无标题"
//      $0.font = .systemFont(ofSize: 14, weight: .medium)
//      $0.textColor = .label
//      $0.numberOfLines = 2
//    }
//
//    let typeLabel = UILabel().then {
//      $0.text = reference.type?.uppercased() ?? "UNKNOWN"
//      $0.font = .systemFont(ofSize: 10, weight: .semibold)
//      $0.textColor = .systemGreen
//      $0.backgroundColor = .systemGreen.withAlphaComponent(0.2)
//      $0.layer.cornerRadius = 4
//      $0.layer.cornerCurve = .continuous
//      $0.textAlignment = .center
//      $0.clipsToBounds = true
//    }
//
//    let stackView = UIStackView().then {
//      $0.axis = .horizontal
//      $0.spacing = 12
//      $0.alignment = .top
//    }
//
//    let textStackView = UIStackView().then {
//      $0.axis = .vertical
//      $0.spacing = 4
//      $0.alignment = .leading
//    }
//
//    let topContainer = UIView()
//    topContainer.addSubview(typeLabel)
//
//    containerView.addSubview(stackView)
//    stackView.addArrangedSubview(iconView)
//    stackView.addArrangedSubview(textStackView)
//    stackView.addArrangedSubview(topContainer)
//
//    textStackView.addArrangedSubview(titleLabel)
//
//    let content = reference.content
//    if !content.isEmpty {
//      let contentLabel = UILabel().then {
//        $0.text = content
//        $0.font = .systemFont(ofSize: 12)
//        $0.textColor = .secondaryLabel
//        $0.numberOfLines = 3
//      }
//      textStackView.addArrangedSubview(contentLabel)
//    }
//
//    stackView.snp.makeConstraints { make in
//      make.edges.equalToSuperview().inset(12)
//    }
//
//    iconView.snp.makeConstraints { make in
//      make.width.height.equalTo(24)
//    }
//
//    typeLabel.snp.makeConstraints { make in
//      make.top.trailing.equalToSuperview()
//      make.height.equalTo(20)
//      make.width.greaterThanOrEqualTo(40)
//    }
//
//    // 设置内边距
//    typeLabel.layer.masksToBounds = true
//    typeLabel.setContentHuggingPriority(.required, for: .horizontal)
//
//    // 添加点击手势
//    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(referenceTapped(_:)))
//    containerView.addGestureRecognizer(tapGesture)
//    containerView.tag = reference.hashValue
//
//    return containerView
//  }

  // MARK: - Actions

//  @objc private func referenceTapped(_ gesture: UITapGestureRecognizer) {
//    guard let containerView = gesture.view,
//          let reference = viewModel?.references.first(where: { $0.hashValue == containerView.tag })
//    else {
//      return
//    }

  // TODO: 实现引用打开逻辑
//    print("Open context reference: \\(reference.title ?? reference.id)")
//  }
}
