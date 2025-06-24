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

extension InputBox: ImageAttachmentBarDelegate {
  func inputBoxImageBar(_: ImageAttachmentBar, didRemoveImageWithId id: ImageAttachment.ID) {
    performWithAnimation { [self] in
      viewModel.removeImageAttachment(withId: id)
      layoutIfNeeded()
    }
  }
}
