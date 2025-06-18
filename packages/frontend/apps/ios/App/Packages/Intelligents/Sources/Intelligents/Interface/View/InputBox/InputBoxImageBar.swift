//
//  InputBoxImageBar.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/18/25.
//

import SnapKit
import Then
import UIKit

protocol InputBoxImageBarDelegate: AnyObject {
  func inputBoxImageBar(_ imageBar: InputBoxImageBar, didRemoveImageAt index: Int)
}

private let constantHeight: CGFloat = 108

class InputBoxImageBar: UIScrollView {
  weak var imageBarDelegate: InputBoxImageBarDelegate?

  private lazy var stackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 8
    $0.alignment = .center
    $0.distribution = .equalSpacing
  }

  private var imageCells: [ImageCell] = []

  override init(frame: CGRect = .zero) {
    super.init(frame: frame)
    setupViews()
    setupConstraints()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  private func setupViews() {
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    addSubview(stackView)
  }

  private func setupConstraints() {
    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
      make.height.equalTo(constantHeight)
    }

    snp.makeConstraints { make in
      make.height.equalTo(constantHeight)
    }
  }

  func addImage(_ image: UIImage) {
    let imageCell = ImageCell(image: image)
    imageCell.onRemove = { [weak self] cell in
      self?.removeImageCell(cell)
    }

    imageCells.append(imageCell)
    stackView.addArrangedSubview(imageCell)
    updateContentSize()
  }

  func removeImageCell(_ cell: ImageCell) {
    if let index = imageCells.firstIndex(of: cell) {
      imageCells.remove(at: index)
      stackView.removeArrangedSubview(cell)
      cell.removeFromSuperview()
      imageBarDelegate?.inputBoxImageBar(self, didRemoveImageAt: index)
      updateContentSize()
    }
  }

  func clear() {
    for cell in imageCells {
      stackView.removeArrangedSubview(cell)
      cell.removeFromSuperview()
    }
    imageCells.removeAll()
    updateContentSize()
  }

  private func updateContentSize() {
    layoutIfNeeded()
    contentSize = stackView.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
  }
}

extension InputBoxImageBar {
  class ImageCell: UIView {
    var onRemove: ((ImageCell) -> Void)?

    private lazy var imageView = UIImageView().then {
      $0.contentMode = .scaleAspectFill
      $0.clipsToBounds = true
      $0.layer.cornerRadius = 12
      $0.backgroundColor = .systemGray6
    }

    private lazy var removeButton = UIButton(type: .system).then {
      $0.backgroundColor = UIColor.black.withAlphaComponent(0.52)
      $0.layer.cornerRadius = 8.5
      $0.layer.borderWidth = 1
      $0.layer.borderColor = UIColor(red: 0.9, green: 0.9, blue: 0.9, alpha: 1).cgColor
      $0.setImage(UIImage(systemName: "xmark"), for: .normal)
      $0.tintColor = .white
      $0.addTarget(self, action: #selector(removeButtonTapped), for: .touchUpInside)
    }

    init(image: UIImage) {
      super.init(frame: .zero)
      setupViews()
      setupConstraints()
      imageView.image = image
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
      fatalError()
    }

    private func setupViews() {
      addSubview(imageView)
      addSubview(removeButton)
    }

    private func setupConstraints() {
      // 设置固定高度和1:1宽高比
      snp.makeConstraints { make in
        make.width.height.equalTo(constantHeight)
      }

      imageView.snp.makeConstraints { make in
        make.edges.equalToSuperview()
      }

      removeButton.snp.makeConstraints { make in
        make.top.trailing.equalToSuperview().inset(6.5)
        make.width.height.equalTo(17)
      }
    }

    @objc private func removeButtonTapped() {
      onRemove?(self)
    }
  }
}
