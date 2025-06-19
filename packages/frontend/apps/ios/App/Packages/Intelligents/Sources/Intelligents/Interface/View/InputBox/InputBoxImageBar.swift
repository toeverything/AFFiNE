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
  func inputBoxImageBar(_ imageBar: InputBoxImageBar, didRemoveImageWithId id: UUID)
}

private class AttachmentViewModel {
  let attachment: InputAttachment
  let imageCell: InputBoxImageBar.ImageCell

  init(attachment: InputAttachment, imageCell: InputBoxImageBar.ImageCell) {
    self.attachment = attachment
    self.imageCell = imageCell
  }
}

class InputBoxImageBar: UIScrollView {
  weak var imageBarDelegate: InputBoxImageBarDelegate?

  private var attachmentViewModels: [AttachmentViewModel] = []
  private let cellSpacing: CGFloat = 8
  private let constantHeight: CGFloat = 80

  override init(frame: CGRect = .zero) {
    super.init(frame: frame)
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false

    snp.makeConstraints { make in
      make.height.equalTo(constantHeight)
    }
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func updateImageBarContent(_ attachments: [InputAttachment]) {
    let currentIds = Set(attachmentViewModels.map(\.attachment.id))
    let imageAttachments = attachments.filter { $0.type == .image }
    let newIds = Set(imageAttachments.map(\.id))

    // 移除不再存在的附件
    let idsToRemove = currentIds.subtracting(newIds)
    for id in idsToRemove {
      if let index = attachmentViewModels.firstIndex(where: { $0.attachment.id == id }) {
        let viewModel = attachmentViewModels.remove(at: index)
        viewModel.imageCell.removeFromSuperview()
      }
    }

    // 添加新的附件
    let idsToAdd = newIds.subtracting(currentIds)
    var initialXOffset = attachmentViewModels.reduce(0) { $0 + $1.imageCell.frame.width + cellSpacing }
     for attachment in imageAttachments {
      if idsToAdd.contains(attachment.id),
         let data = attachment.data,
         let image = UIImage(data: data)
      {
        let imageCell = ImageCell(
          // for animation to work
          frame: .init(x: initialXOffset, y: 0, width: constantHeight, height: constantHeight),
          image: image,
          attachmentId: attachment.id
        )
        initialXOffset += constantHeight + cellSpacing
        imageCell.onRemove = { [weak self] cell in
          self?.removeImageCell(cell)
        }
        imageCell.alpha = 0
        DispatchQueue.main.async {
          performWithAnimation { imageCell.alpha = 1 }
        }

        let viewModel = AttachmentViewModel(attachment: attachment, imageCell: imageCell)
        attachmentViewModels.append(viewModel)
        addSubview(imageCell)
      }
    }

    layoutImageCells()
  }

  func removeImageCell(_ cell: ImageCell) {
    if let index = attachmentViewModels.firstIndex(where: { $0.imageCell === cell }) {
      let viewModel = attachmentViewModels.remove(at: index)
      viewModel.imageCell.removeFromSuperviewWithExplodeEffect()
      imageBarDelegate?.inputBoxImageBar(self, didRemoveImageWithId: cell.attachmentId)
      layoutImageCells()
    }
  }

  func clear() {
    for viewModel in attachmentViewModels {
      viewModel.imageCell.removeFromSuperview()
    }
    attachmentViewModels.removeAll()
    contentSize = .zero
  }

  private func layoutImageCells() {
    var xOffset: CGFloat = 0

    for viewModel in attachmentViewModels {
      viewModel.imageCell.frame = CGRect(x: xOffset, y: 0, width: constantHeight, height: constantHeight)
      xOffset += constantHeight + cellSpacing
    }

    // Update content size
    let totalWidth = max(0, xOffset - cellSpacing)
    contentSize = CGSize(width: totalWidth, height: constantHeight)
  }
}

extension InputBoxImageBar {
  class ImageCell: UIView {
    let attachmentId: UUID
    var onRemove: ((ImageCell) -> Void)?

    private lazy var imageView = UIImageView(frame: bounds).then {
      $0.contentMode = .scaleAspectFill
      $0.clipsToBounds = true
      $0.layer.cornerRadius = 12
      $0.layer.cornerCurve = .continuous
      $0.backgroundColor = .systemGray6
    }

    private lazy var removeButton = DeleteButtonView(frame: removeButtonFrame).then {
      $0.onTapped = { [weak self] in
        self?.removeButtonTapped()
      }
    }

    init(frame: CGRect, image: UIImage, attachmentId: UUID) {
      self.attachmentId = attachmentId
      super.init(frame: frame)
      addSubview(imageView)
      addSubview(removeButton)
      imageView.image = image
    }

    var removeButtonFrame: CGRect {
      let buttonSize: CGFloat = 18
      let buttonInset: CGFloat = 6
      return CGRect(
        x: bounds.width - buttonSize - buttonInset,
        y: buttonInset,
        width: buttonSize,
        height: buttonSize
      )
    }

    override func layoutSubviews() {
      super.layoutSubviews()

      imageView.frame = bounds

      removeButton.frame = removeButtonFrame
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
      fatalError()
    }

    @objc private func removeButtonTapped() {
      onRemove?(self)
    }
  }
}
