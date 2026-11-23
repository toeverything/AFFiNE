//
//  UserMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Litext
import SnapKit
import UIKit

private let labelForSizeCalculation = LTXLabel()

class UserMessageCell: ChatBaseCell {
  let backgroundView = UIView().then {
    $0.backgroundColor = .gray.withAlphaComponent(0.05)
    $0.layer.cornerRadius = 8
  }

  let contentLabel = LTXLabel().then {
    $0.isSelectable = true
  }

  override func prepareContentView(inside contentView: UIView) {
    super.prepareContentView(inside: contentView)

    contentView.addSubview(backgroundView)
    backgroundView.addSubview(contentLabel)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    contentLabel.attributedText = .init()
  }

  override func configure(with viewModel: any ChatCellViewModel) {
    super.configure(with: viewModel)
    guard let vm = viewModel as? UserMessageCellViewModel else {
      assertionFailure("")
      return
    }
    contentLabel.attributedText = Self.prepareAttributeText(vm.content)
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)

    let inset: CGFloat = 8
    let textMaxWidth = bounds.width * 0.8 - inset * 2
    contentLabel.preferredMaxLayoutWidth = textMaxWidth
    let textSize = contentLabel.intrinsicContentSize
    let backgroundWidth = textSize.width + inset * 2

    backgroundView.frame = .init(
      x: bounds.width - backgroundWidth, // right aligned
      y: 0,
      width: backgroundWidth,
      height: bounds.height
    )
    contentLabel.frame = backgroundView.bounds.insetBy(dx: inset, dy: inset)
  }

  class func prepareAttributeText(_ text: String) -> NSAttributedString {
    .init(string: text, attributes: [
      .font: UIFont.preferredFont(forTextStyle: .body),
      .foregroundColor: UIColor.affineTextPrimary,
      .paragraphStyle: NSMutableParagraphStyle().then {
        $0.lineBreakMode = .byWordWrapping
        $0.alignment = .natural
        $0.lineSpacing = 2
        $0.paragraphSpacing = 4
      },
    ])
  }

  override class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    guard let vm = viewModel as? UserMessageCellViewModel else {
      assertionFailure()
      return 0
    }
    labelForSizeCalculation.attributedText = prepareAttributeText(vm.content)

    let inset: CGFloat = 8
    labelForSizeCalculation.preferredMaxLayoutWidth = width * 0.8 - inset * 2
    let textSize = labelForSizeCalculation.intrinsicContentSize
    return textSize.height + inset * 2
  }
}
