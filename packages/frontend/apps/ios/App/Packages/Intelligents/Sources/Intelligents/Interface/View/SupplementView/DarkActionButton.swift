//
//  DarkActionButton.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/21.
//

import UIKit

class DarkActionButton: UIView {
  var iconSystemName: String {
    set { iconView.image = UIImage(systemName: newValue) }
    get { fatalError() }
  }

  var title: String {
    set { titleLabel.text = newValue }
    get { titleLabel.text ?? "" }
  }

  let titleLabel = UILabel()
  let iconView = UIImageView()
  var action: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .white.withAlphaComponent(0.25)
    layer.cornerRadius = 12

    let layoutGuide = UILayoutGuide()
    addLayoutGuide(layoutGuide)

    titleLabel.textAlignment = .center
    titleLabel.font = .systemFont(ofSize: UIFont.labelFontSize, weight: .semibold)
    titleLabel.textColor = .white
    addSubview(titleLabel)

    iconView.contentMode = .scaleAspectFit
    iconView.tintColor = .white
    addSubview(iconView)

    [
      layoutGuide.centerXAnchor.constraint(equalTo: centerXAnchor),
      layoutGuide.centerYAnchor.constraint(equalTo: centerYAnchor),

      iconView.topAnchor.constraint(greaterThanOrEqualTo: layoutGuide.topAnchor),
      iconView.leadingAnchor.constraint(equalTo: layoutGuide.leadingAnchor),
      iconView.bottomAnchor.constraint(lessThanOrEqualTo: layoutGuide.bottomAnchor),
      iconView.centerYAnchor.constraint(equalTo: layoutGuide.centerYAnchor),

      titleLabel.topAnchor.constraint(greaterThanOrEqualTo: layoutGuide.topAnchor),
      titleLabel.trailingAnchor.constraint(equalTo: layoutGuide.trailingAnchor),
      titleLabel.bottomAnchor.constraint(lessThanOrEqualTo: layoutGuide.bottomAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: layoutGuide.centerYAnchor),

      titleLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
    ].forEach { $0.isActive = true }

    isUserInteractionEnabled = true
    addGestureRecognizer(UITapGestureRecognizer(
      target: self,
      action: #selector(onTapped)
    ))
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  @objc func onTapped() {
    action?()
  }
}
