//
//  InputBox+Delegates.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/18/25.
//

import SwifterSwift
import UIKit

extension InputBox: ImageAttachmentBarDelegate {
  func inputBoxImageBar(_: ImageAttachmentBar, didRemoveImageWithId id: ImageAttachment.ID) {
    performWithAnimation { [self] in
      viewModel.removeImageAttachment(withId: id)
      layoutIfNeeded()
    }
  }
}

extension InputBox: FileAttachmentHeaderViewDelegate {
  func headerViewDidPickMore(_: FileAttachmentHeaderView) {
    delegate?.inputBoxDidSelectAttachFiles(self)
  }

  func headerViewDidTapManagement(_: FileAttachmentHeaderView) {
    let controller = AttachmentManagementController(delegate: self)
    controller.set(fileAttachments: viewModel.fileAttachments)
    controller.set(documentAttachments: viewModel.documentAttachments)
    parentViewController?.present(controller, animated: true)
  }
}

extension InputBox: AttachmentManagementControllerDelegate {
  func deleteFileAttachment(controller: AttachmentManagementController, _ attachment: FileAttachment) {
    viewModel.removeFileAttachment(withId: attachment.id)
    controller.set(fileAttachments: viewModel.fileAttachments)
    layoutIfNeeded()
  }

  func deleteDocumentAttachment(controller: AttachmentManagementController, _ attachment: DocumentAttachment) {
    viewModel.removeDocumentAttachment(withId: attachment.id)
    controller.set(documentAttachments: viewModel.documentAttachments)
    layoutIfNeeded()
  }
}

extension InputBox: InputBoxFunctionBarDelegate {
  func functionBarDidTapTakePhoto(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectTakePhoto(self)
  }

  func functionBarDidTapPhotoLibrary(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectPhotoLibrary(self)
  }

  func functionBarDidTapAttachFiles(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectAttachFiles(self)
  }

  func functionBarDidTapEmbedDocs(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectEmbedDocs(self)
  }

  func functionBarDidTapTool(_: InputBoxFunctionBar) {
    viewModel.toggleTool()
  }

  func functionBarDidTapNetwork(_: InputBoxFunctionBar) {
    viewModel.toggleNetwork()
  }

  func functionBarDidTapDeepThinking(_: InputBoxFunctionBar) {
    viewModel.toggleDeepThinking()
  }

  func functionBarDidTapSend(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSend(self)
  }
}

extension InputBox: UITextViewDelegate {
  func textViewDidChange(_ textView: UITextView) {
    viewModel.updateText(textView.text ?? "")
    delegate?.inputBoxTextDidChange(textView.text ?? "")
    updatePlaceholderVisibility()
    updateTextViewHeight()
  }

  func textView(_: UITextView, shouldChangeTextIn _: NSRange, replacementText text: String) -> Bool {
    if text == "\n" {
      delegate?.inputBoxDidSend(self)
      return false
    }
    return true
  }

  func textView(_ textView: UITextView, editMenuForTextIn _: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
    let insertNewLineAction = UIAction(title: "Insert New Line") { _ in
      textView.insertText("\n")
    }

    return UIMenu(children: suggestedActions + [insertNewLineAction])
  }
}
