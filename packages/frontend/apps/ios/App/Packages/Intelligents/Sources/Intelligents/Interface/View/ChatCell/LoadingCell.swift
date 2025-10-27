//
//  LoadingCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Litext
import SnapKit
import UIKit

class LoadingCell: ChatBaseCell {
  override func prepareContentView(inside contentView: UIView) {
    super.prepareContentView(inside: contentView)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
  }

  override func layoutContentView(bounds: CGRect) {
    super.layoutContentView(bounds: bounds)
  }

  override class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    _ = viewModel
    _ = width
    return 0
  }
}
