//
//  CircleView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import UIKit

class CircleView: UIView {
  init() {
    super.init(frame: .zero)
    backgroundColor = .label
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layer.cornerRadius = (frame.height + frame.width) / 4
  }
}
