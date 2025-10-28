//
//  DocumentTableViewCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import SnapKit
import UIKit

class DocumentTableViewCell: UITableViewCell {
  static let cellInset: CGFloat = 16
  static let iconSize: CGFloat = 20
  static let spacing: CGFloat = 16

  private lazy var iconImageView = UIImageView().then {
    $0.contentMode = .scaleAspectFit
    $0.tintColor = UIColor(hex: 0x141414)
  }

  private lazy var titleLabel = UILabel().then {
    $0.font = .systemFont(ofSize: 17, weight: .regular)
    $0.textColor = UIColor(hex: 0x141414)
    $0.textAlignment = .left
  }

  private lazy var checkmarkImageView = UIImageView().then {
    $0.image = UIImage(systemName: "checkmark.circle.fill")
    $0.tintColor = .systemBlue
    $0.contentMode = .scaleAspectFit
    $0.isHidden = true
  }

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupUI() {
    backgroundColor = .white
    selectionStyle = .none

    contentView.clipsToBounds = true

    contentView.addSubview(iconImageView)
    contentView.addSubview(titleLabel)
    contentView.addSubview(checkmarkImageView)

    iconImageView.snp.makeConstraints { make in
      make.leading.equalToSuperview().offset(Self.cellInset)
      make.centerY.equalToSuperview()
      make.width.height.equalTo(Self.iconSize)
    }

    titleLabel.snp.makeConstraints { make in
      make.leading.equalTo(iconImageView.snp.trailing).offset(Self.spacing)
      make.trailing.equalTo(checkmarkImageView.snp.leading).offset(-Self.spacing)
      make.centerY.equalToSuperview()
    }

    checkmarkImageView.snp.makeConstraints { make in
      make.trailing.equalToSuperview().offset(-Self.cellInset)
      make.centerY.equalToSuperview()
      make.width.height.equalTo(Self.iconSize)
    }
  }

  func configure(with document: DocumentItem, isSelected: Bool = false) {
    iconImageView.image = UIImage(systemName: "doc.text")
    titleLabel.text = document.title
    checkmarkImageView.isHidden = !isSelected
  }
}
