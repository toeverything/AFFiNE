//
//  InputBoxDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/18/25.
//

import UIKit

protocol InputBoxDelegate: AnyObject {
  func inputBoxDidSelectAttachment(_ inputBox: InputBox)
  func inputBoxDidSend(_ inputBox: InputBox)
  func inputBoxTextDidChange(_ text: String)
}

extension InputBox: InputBoxImageBarDelegate {
  func inputBoxImageBar(_: InputBoxImageBar, didRemoveImageAt index: Int) {
    viewModel.removeAttachment(at: index)
  }
}

extension InputBox: UITextViewDelegate {
  func textViewDidChange(_ textView: UITextView) {
    viewModel.updateText(textView.text ?? "")
    delegate?.inputBoxTextDidChange(textView.text ?? "")
    updatePlaceholderVisibility()
    updateTextViewHeight()
  }
}
