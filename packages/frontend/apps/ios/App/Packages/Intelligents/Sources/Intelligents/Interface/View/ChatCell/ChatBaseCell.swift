//
//  ChatBaseCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import ListViewKit
import Litext
import MarkdownView
import SnapKit
import UIKit

class ChatBaseCell: ListRowView {
  static var contentInsets: UIEdgeInsets {
    .init(top: 0, left: 16, bottom: 16, right: 16)
  }

  private let contentView = UIView()

  init() {
    super.init(frame: .zero)
    addSubview(contentView)
    prepareContentView(inside: contentView)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func prepareContentView(inside contentView: UIView) {
    _ = contentView
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let contentInsets = Self.contentInsets
    contentView.frame = .init(
      x: contentInsets.left,
      y: contentInsets.top,
      width: bounds.width - contentInsets.left - contentInsets.right,
      height: bounds.height - contentInsets.top - contentInsets.bottom
    )
    layoutContentView(bounds: contentView.bounds)
  }

  override func addSubview(_ view: UIView) {
    assert(view == contentView)
    super.addSubview(view)
  }

  func layoutContentView(bounds: CGRect) {
    _ = bounds // override pass
  }

  class func heightForContent(
    for viewModel: any ChatCellViewModel,
    width: CGFloat
  ) -> CGFloat {
    _ = viewModel
    _ = width
    return 0 // override pass
  }

  static func heightForCell(for viewModel: any ChatCellViewModel, width: CGFloat) -> CGFloat {
    let contentWidth = width - contentInsets.left - contentInsets.right
    return heightForContent(
      for: viewModel,
      width: contentWidth
    ) + contentInsets.top + contentInsets.bottom
  }

  func configure(with viewModel: any ChatCellViewModel) {
    _ = viewModel
  }
}
