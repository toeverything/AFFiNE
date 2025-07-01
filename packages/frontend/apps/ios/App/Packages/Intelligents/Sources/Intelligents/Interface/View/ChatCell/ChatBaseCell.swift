//
//  ChatBaseCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class ChatBaseCell: UITableViewCell {
  // MARK: - UI Components

  /// 主容器视图，负责管理内边距和统一行为
  lazy var containerView = UIView().then {
    $0.layer.cornerRadius = 8
    $0.layer.cornerCurve = .continuous
  }

  // MARK: - Properties

  /// 容器视图的内边距，子类可以重写
  var containerInsets: UIEdgeInsets {
    UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
  }

  /// 容器视图内部的内边距，子类可以重写
  var contentInsets: UIEdgeInsets {
    UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
  }

  // MARK: - Initialization

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    setupBaseUI()
    setupContentView()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupBaseUI() {
    backgroundColor = .clear
    selectionStyle = .none

    contentView.addSubview(containerView)
    containerView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(containerInsets)
    }
  }

  /// 子类重写此方法来设置具体的内容视图
  func setupContentView() {
    // 子类实现
  }

  // MARK: - Configuration

  /// 配置容器视图的外观
  func configureContainer(backgroundColor: UIColor?, borderColor: UIColor? = nil, borderWidth: CGFloat = 0) {
    containerView.backgroundColor = backgroundColor

    if let borderColor {
      containerView.layer.borderColor = borderColor.cgColor
      containerView.layer.borderWidth = borderWidth
    } else {
      containerView.layer.borderColor = nil
      containerView.layer.borderWidth = 0
    }
  }

  /// 配置 ViewModel，子类需要重写
  func configure(with _: any ChatCellViewModel) {
    // 子类实现
  }

  // MARK: - Helpers

  /// 获取适当的文本颜色
  func textColor(for cellType: CellType) -> UIColor {
    switch cellType {
    case .userMessage, .assistantMessage, .systemMessage:
      .label
    case .error:
      .systemRed
    case .loading:
      .secondaryLabel
    }
  }

  /// 获取适当的背景颜色
  func backgroundColor(for cellType: CellType) -> UIColor? {
    switch cellType {
    case .userMessage, .assistantMessage:
      .clear
    case .systemMessage:
      .systemYellow.withAlphaComponent(0.2)
    case .error:
      .systemRed.withAlphaComponent(0.1)
    case .loading:
      .systemGray6
    }
  }
}
