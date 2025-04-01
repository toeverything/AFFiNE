//
//  PlainTextEditView.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit

class PlainTextEditView: UITextView, UITextViewDelegate {
  var textDidChange: ((String) -> Void) = { _ in }
  var textDidReturn: (() -> Void) = {}

  init() {
    super.init(frame: .zero, textContainer: nil)

    delegate = self
    tintColor = .accent

    linkTextAttributes = [:]
    showsVerticalScrollIndicator = false
    showsHorizontalScrollIndicator = false
    textContainer.lineFragmentPadding = .zero
    textAlignment = .natural
    backgroundColor = .clear
    textContainerInset = .zero
    textContainer.lineBreakMode = .byTruncatingTail
    isScrollEnabled = false
    clipsToBounds = false

    isEditable = true
    isSelectable = true
    isScrollEnabled = false
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func textViewDidChange(_ textView: UITextView) {
    textDidChange(textView.text)
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    textDidChange(textView.text)
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    textDidChange(textView.text)
  }

  func textView(_: UITextView, editMenuForTextIn _: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
    .init(children: suggestedActions + [
      UIAction(title: "Insert Newline") { [weak self] _ in
        self?.insertText("\n")
      },
    ])
  }

  func textView(_: UITextView, shouldChangeTextIn _: NSRange, replacementText text: String) -> Bool {
    if text == "\n" {
      textDidReturn()
      return false
    } else {
      return true
    }
  }
}
