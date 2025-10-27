//
//  SystemMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Litext
import SnapKit
import UIKit

private let labelForSizeCalculation = LTXLabel()

class SystemMessageCell: ChatBaseCell {
  let contentLabel = LTXLabel().then {
    $0.isSelectable = false
  }

  override func prepareContentView(inside contentView: UIView) {
    super.prepareContentView(inside: contentView)
    contentView.addSubview(contentLabel)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    contentLabel.attributedText = .init()
  }

  override func configure(with viewModel: any ChatCellViewModel) {
    super.configure(with: viewModel)
    guard let vm = viewModel as? SystemMessageCellViewModel else {
      assertionFailure("")
      return
    }
    contentLabel.attributedText = Self.prepareAttributeText(vm.content)
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)
    let textMaxWidth = bounds.width * 0.8
    contentLabel.preferredMaxLayoutWidth = textMaxWidth
    let textSize = contentLabel.intrinsicContentSize
    let labelWidth = textSize.width
    let labelHeight = textSize.height
    contentLabel.frame = .init(
      x: (bounds.width - labelWidth) / 2,
      y: 0,
      width: labelWidth,
      height: labelHeight
    )
  }

  class func prepareAttributeText(_ text: String) -> NSAttributedString {
    .init(string: text, attributes: [
      .font: UIFont.preferredFont(forTextStyle: .footnote),
      .foregroundColor: UIColor.affineTextSecondary,
      .paragraphStyle: NSMutableParagraphStyle().then {
        $0.lineBreakMode = .byWordWrapping
        $0.alignment = .center
        $0.lineSpacing = 2
        $0.paragraphSpacing = 4
      },
    ])
  }

  override class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    guard let vm = viewModel as? SystemMessageCellViewModel else {
      assertionFailure()
      return 0
    }
    labelForSizeCalculation.attributedText = prepareAttributeText(vm.content)
    labelForSizeCalculation.preferredMaxLayoutWidth = width * 0.8
    let textSize = labelForSizeCalculation.intrinsicContentSize
    return textSize.height
  }
}
