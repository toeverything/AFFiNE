//
//  AssistantMessageCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Litext
import MarkdownView
import SnapKit
import UIKit

private let markdownViewForSizeCalculation: MarkdownTextView = .init()

class AssistantMessageCell: ChatBaseCell {
  let markdownView = MarkdownTextView()

  override func prepareContentView(inside contentView: UIView) {
    super.prepareContentView(inside: contentView)
    contentView.addSubview(markdownView)
  }

  override func configure(with viewModel: any ChatCellViewModel) {
    super.configure(with: viewModel)

    guard let vm = viewModel as? AssistantMessageCellViewModel else {
      assertionFailure()
      return
    }
    markdownView.setMarkdown(vm.preprocessedContent)
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)
    markdownView.frame = bounds
  }

  override class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    let vm = viewModel as! AssistantMessageCellViewModel
    markdownViewForSizeCalculation.theme = .default
    markdownViewForSizeCalculation.frame = .init(
      x: 0, y: 0, width: width, height: .greatestFiniteMagnitude
    )
    markdownViewForSizeCalculation.setMarkdownManually(vm.preprocessedContent)
    let boundingSize = markdownViewForSizeCalculation.boundingSize(for: width)
    return ceil(boundingSize.height)
  }
}
