//
//  CircleImageView.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/12/13.
//

import UIKit

class CircleImageView: UIImageView {
  init() {
    super.init(frame: .zero)

    contentMode = .scaleAspectFill
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    clipsToBounds = true
    layer.cornerRadius = (bounds.width + bounds.height) / 2 / 2
    layer.masksToBounds = true
  }
}
