//
//  IntelligentsEphemeralActionController+Header.swift
//  Intelligents
//
//  Created by 秋星桥 on 2025/1/8.
//

//
//  IntelligentsChatController+Header.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit

extension IntelligentsEphemeralActionController {
  class Header: UIView {
    static let height: CGFloat = 44

    let contentView = UIView()
    let titleLabel = UILabel()
    let dropMenu = UIButton()
    let backButton = UIButton()
    let rightBarItemsStack = UIStackView()
    let moreMenu = UIButton()

    init() {
      super.init(frame: .zero)
      setupLayout()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
      fatalError()
    }

    @objc func navigateActionBack() {
      parentViewController?.dismissInContext()
    }
  }
}

private extension IntelligentsEphemeralActionController.Header {
  func setupLayout() {
    contentView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(contentView)
    [
      contentView.leadingAnchor.constraint(equalTo: leadingAnchor),
      contentView.trailingAnchor.constraint(equalTo: trailingAnchor),
      contentView.bottomAnchor.constraint(equalTo: bottomAnchor),
      contentView.heightAnchor.constraint(equalToConstant: Self.height),
    ].forEach { $0.isActive = true }

    titleLabel.textColor = .label
    titleLabel.font = .systemFont(
      ofSize: UIFont.labelFontSize,
      weight: .semibold
    )

    backButton.setImage(
      UIImage(systemName: "chevron.left"),
      for: .normal
    )
    backButton.tintColor = .accent
    backButton.addTarget(self, action: #selector(navigateActionBack), for: .touchUpInside)

    dropMenu.setImage(
      .init(systemName: "chevron.down")?.withRenderingMode(.alwaysTemplate),
      for: .normal
    )
    dropMenu.tintColor = .gray.withAlphaComponent(0.5)

    contentView.addSubview(titleLabel)
    contentView.addSubview(backButton)
    contentView.addSubview(dropMenu)
    contentView.addSubview(rightBarItemsStack)
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    backButton.translatesAutoresizingMaskIntoConstraints = false
    dropMenu.translatesAutoresizingMaskIntoConstraints = false
    rightBarItemsStack.translatesAutoresizingMaskIntoConstraints = false

    rightBarItemsStack.axis = .horizontal
    rightBarItemsStack.spacing = 10
    rightBarItemsStack.alignment = .center
    rightBarItemsStack.distribution = .equalSpacing

    [
      backButton.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      backButton.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 10),
      backButton.widthAnchor.constraint(equalToConstant: 44),
      backButton.heightAnchor.constraint(equalToConstant: 44),

      rightBarItemsStack.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      rightBarItemsStack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -10),
      rightBarItemsStack.heightAnchor.constraint(equalToConstant: 44),

      titleLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: backButton.trailingAnchor, constant: 10),

      dropMenu.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      dropMenu.widthAnchor.constraint(equalToConstant: 44),
      dropMenu.heightAnchor.constraint(equalToConstant: 44),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: dropMenu.leadingAnchor, constant: -10),
    ].forEach { $0.isActive = true }

    rightBarItemsStack.addArrangedSubview(moreMenu)
    moreMenu.setImage(
      .init(systemName: "ellipsis.circle"),
      for: .normal
    )
    moreMenu.tintColor = .accent
  }
}
