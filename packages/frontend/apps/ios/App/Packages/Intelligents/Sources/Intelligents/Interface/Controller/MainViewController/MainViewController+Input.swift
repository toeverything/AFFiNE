//
//  MainViewController+Input.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import UIKit

extension MainViewController: InputBoxDelegate {
  func inputBoxDidSelectTakePhoto(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSelectPhotoLibrary(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSelectAttachFiles(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSelectEmbedDocs(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSelectAttachment(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSend(_ inputBox: InputBox) {
    print(#function, inputBox, inputBox.viewModel)
  }

  func inputBoxTextDidChange(_ text: String) {
    print(#function, text)
  }
}
