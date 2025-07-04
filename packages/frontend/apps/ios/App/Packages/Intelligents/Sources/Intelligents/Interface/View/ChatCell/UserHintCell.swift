//
//  UserHintCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 7/4/25.
//

import Litext
import UIKit

private let labelForSizeCalculation = LTXLabel()
private let formatter: DateFormatter = {
  let formatter = DateFormatter()
  formatter.dateStyle = .none
  formatter.timeStyle = .short
  formatter.locale = .current
  return formatter
}()

class UserHintCell: ChatBaseCell {
  let contentLabel = LTXLabel().then {
    $0.isSelectable = true
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
    guard let vm = viewModel as? UserHintCellViewModel else {
      assertionFailure("")
      return
    }
    contentLabel.attributedText = Self.prepareAttributeText(Self.prepareText(vm))
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)

    contentLabel.preferredMaxLayoutWidth = bounds.width
    let textSize = contentLabel.intrinsicContentSize
    contentLabel.frame = CGRect(
      x: bounds.width - textSize.width,
      y: 0,
      width: textSize.width,
      height: bounds.height
    )
  }

  class func prepareText(_ vm: UserHintCellViewModel) -> String {
    let attachmentsCount = [
      vm.docAttachments.count,
      vm.imageAttachments.count,
      vm.fileAttachments.count,
    ].reduce(0, +)
    let text: [String] = [
      formatter.string(from: vm.timestamp),
      {
        if attachmentsCount > 0 {
          String(localized: "\(attachmentsCount) attachments")
        } else {
          ""
        }
      }(),
    ].filter { !$0.isEmpty }
    return text.joined(separator: " ")
  }

  class func prepareAttributeText(_ text: String) -> NSAttributedString {
    .init(string: text, attributes: [
      .font: UIFont.preferredFont(forTextStyle: .footnote),
      .foregroundColor: UIColor.affineTextSecondary,
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
    guard let vm = viewModel as? UserHintCellViewModel else {
      assertionFailure()
      return 0
    }
    labelForSizeCalculation.attributedText = prepareAttributeText(prepareText(vm))
    labelForSizeCalculation.preferredMaxLayoutWidth = width
    return labelForSizeCalculation.intrinsicContentSize.height
  }
}
