//
//  InputBoxDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/18/25.
//

import UIKit

protocol InputBoxDelegate: AnyObject {
  func inputBoxDidSelectTakePhoto(_ inputBox: InputBox)
  func inputBoxDidSelectPhotoLibrary(_ inputBox: InputBox)
  func inputBoxDidSelectAttachFiles(_ inputBox: InputBox)
  func inputBoxDidSelectEmbedDocs(_ inputBox: InputBox)
  func inputBoxDidSend(_ inputBox: InputBox)
  func inputBoxTextDidChange(_ text: String)
}

extension InputBox: InputBoxImageBarDelegate {
  func inputBoxImageBar(_: InputBoxImageBar, didRemoveImageWithId id: InputAttachment.ID) {
    performWithAnimation { [self] in
      viewModel.removeAttachment(withId: id)
      layoutIfNeeded()
    }
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
