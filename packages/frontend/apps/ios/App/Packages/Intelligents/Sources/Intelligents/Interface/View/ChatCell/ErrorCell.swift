//
//  ErrorCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Litext
import SnapKit
import UIKit

class ErrorCell: ChatBaseCell {
  let label = UILabel()

  override func prepareContentView(inside contentView: UIView) {
    super.prepareContentView(inside: contentView)
    contentView.addSubview(label)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    label.attributedText = nil
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)
    let width = bounds.width * 0.8
    label.frame = .init(
      x: (bounds.width - width) / 2,
      y: 0,
      width: width,
      height: bounds.height
    )
  }

  override func configure(with viewModel: any ChatCellViewModel) {
    super.configure(with: viewModel)
    guard let vm = viewModel as? ErrorCellViewModel else {
      assertionFailure("Invalid view model type")
      return
    }
    label.attributedText = Self.attributeText(for: vm.errorMessage)
  }

  static func attributeText(for text: String) -> NSAttributedString {
    .init(string: text, attributes: [
      .font: UIFont.preferredFont(forTextStyle: .footnote),
      .foregroundColor: UIColor.affineTextSecondary,
      .paragraphStyle: NSMutableParagraphStyle().then {
        $0.lineBreakMode = .byWordWrapping
        $0.alignment = .center
      },
    ])
  }

  override class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    let vm = viewModel as! ErrorCellViewModel
    let text = Self.attributeText(for: vm.errorMessage)
    let boundingRect = text.boundingRect(
      with: CGSize(width: width * 0.8, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil
    )
    let boundingSize = boundingRect.size
    return ceil(boundingSize.height)
  }
}
