//
//  InputBoxDelegate 2.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol InputBoxDelegate: AnyObject {
  func inputBoxDidSelectTakePhoto(_ inputBox: InputBox)
  func inputBoxDidSelectPhotoLibrary(_ inputBox: InputBox)
  func inputBoxDidSelectAttachFiles(_ inputBox: InputBox)
  func inputBoxDidSelectEmbedDocs(_ inputBox: InputBox)
  func inputBoxDidSend(_ inputBox: InputBox)
  func inputBoxTextDidChange(_ text: String)
}
