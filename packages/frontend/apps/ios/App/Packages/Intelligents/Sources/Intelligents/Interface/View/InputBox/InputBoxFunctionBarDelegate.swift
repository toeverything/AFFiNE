//
//  InputBoxFunctionBarDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol InputBoxFunctionBarDelegate: AnyObject {
  func functionBarDidTapTakePhoto(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapPhotoLibrary(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapAttachFiles(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapEmbedDocs(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapTool(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapNetwork(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapDeepThinking(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapSend(_ functionBar: InputBoxFunctionBar)
}
