//
//  TextLabel.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/12.
//

import UIKit

class TextLabel: UITextView {
  #if DEBUG
    private var setupCompleted: Bool = false
  #endif

  override required init(frame: CGRect, textContainer: NSTextContainer?) {
    super.init(frame: frame, textContainer: textContainer)
    commitInit()
  }

  convenience init(frame: CGRect = .zero) {
    if #available(iOS 16.0, macCatalyst 16.0, *) {
      self.init(usingTextLayoutManager: false)
    } else {
      self.init(frame: frame, textContainer: nil)
      _ = layoutManager.textContainers
    }
    commitInit()
  }

  func commitInit() {
    #if DEBUG
      assert(!setupCompleted)
      setupCompleted = true
    #endif
    showsVerticalScrollIndicator = false
    showsHorizontalScrollIndicator = false
    textColor = .label
    textContainer.lineFragmentPadding = .zero
    textAlignment = .natural
    backgroundColor = .clear
    textContainerInset = .zero
    textContainer.lineBreakMode = .byTruncatingTail
    clipsToBounds = false
    isSelectable = true
    isScrollEnabled = false
    isEditable = false
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
