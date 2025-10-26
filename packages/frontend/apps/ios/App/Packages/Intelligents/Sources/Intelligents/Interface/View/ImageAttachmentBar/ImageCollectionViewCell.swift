//
//  ImageCollectionViewCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import UIKit

// MARK: - ImageCollectionViewCell

class ImageCollectionViewCell: UICollectionViewCell {
  private var attachmentId: UUID?
  private var onRemove: ((UUID) -> Void)?

  private lazy var imageView = UIImageView().then {
    $0.contentMode = .scaleAspectFill
    $0.clipsToBounds = true
    $0.layer.cornerRadius = 12
    $0.layer.cornerCurve = .continuous
    $0.backgroundColor = .systemGray6
  }

  private lazy var removeButton = DeleteButtonView().then {
    $0.onTapped = { [weak self] in
      if let attachmentId = self?.attachmentId {
        self?.onRemove?(attachmentId)
      }
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupViews()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupViews() {
    contentView.addSubview(imageView)
    contentView.addSubview(removeButton)

    imageView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    removeButton.snp.makeConstraints { make in
      make.top.trailing.equalToSuperview().inset(6)
      make.size.equalTo(18)
    }
  }

  func configure(with image: UIImage, attachmentId: UUID, onRemove: @escaping (UUID) -> Void) {
    imageView.image = image
    self.attachmentId = attachmentId
    self.onRemove = onRemove
  }
}
