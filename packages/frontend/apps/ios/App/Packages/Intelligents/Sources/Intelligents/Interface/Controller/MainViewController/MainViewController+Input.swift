//
//  MainViewController+Input.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import PhotosUI
import SnapKit
import UIKit
import UniformTypeIdentifiers

extension MainViewController: InputBoxDelegate {
  func inputBoxDidSelectTakePhoto(_: InputBox) {
    let imagePickerController = UIImagePickerController()
    imagePickerController.delegate = self
    imagePickerController.sourceType = .camera
    imagePickerController.allowsEditing = false
    present(imagePickerController, animated: true)
  }

  func inputBoxDidSelectPhotoLibrary(_: InputBox) {
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = 0 // 0 means no limit

    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    present(picker, animated: true)
  }

  func inputBoxDidSelectAttachFiles(_: InputBox) {
    let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: [
      .pdf, .plainText, .commaSeparatedText, .data,
    ])
    documentPicker.delegate = self
    documentPicker.allowsMultipleSelection = false
    present(documentPicker, animated: true)
  }

  func inputBoxDidSelectEmbedDocs(_: InputBox) {
    showDocumentPicker()
  }

  @objc func showDocumentPicker() {
    view.endEditing(true)
    terminateEditGesture.isEnabled = false
    documentPickerView.snp.remakeConstraints { make in
      make.bottom.equalTo(view.keyboardLayoutGuide.snp.top)
      make.leading.trailing.equalToSuperview()
      make.height.equalTo(300)
    }
    documentPickerHideDetector.isHidden = false
    documentPickerView.setSelectedDocuments(inputBox.viewModel.documentAttachments)

    performWithAnimation(duration: 0.75) {
      self.view.layoutIfNeeded()
    } completion: { _ in
      self.documentPickerView.updateDocumentsFromRecentDocs()
      self.documentPickerView.searchTextField.becomeFirstResponder()
    }
  }

  @objc func hideDocumentPicker() {
    terminateEditGesture.isEnabled = true
    documentPickerView.snp.remakeConstraints { make in
      make.top.equalTo(view.snp.bottom).offset(200)
      make.leading.trailing.equalToSuperview()
      make.height.equalTo(300)
    }
    documentPickerHideDetector.isHidden = true
    performWithAnimation(duration: 0.75) {
      self.view.layoutIfNeeded()
    }
  }

  func inputBoxDidSend(_ inputBox: InputBox) {
    let inputData = inputBox.inputBoxData
    inputBox.text = ""
    inputBox.viewModel.clearAllAttachments()

    guard let currentSession = IntelligentContext.shared.currentSession else {
      showAlert(title: "Error", message: "No active session available")
      return
    }

    ChatManager.shared.closeAll()
    ChatManager.shared.startUserRequest(editorData: inputData, sessionId: currentSession.id)
  }

  private func showAlert(title: String, message: String) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    present(alert, animated: true)
  }

  func inputBoxTextDidChange(_ text: String) {
    print(#function, text)
  }
}

// MARK: - UIImagePickerControllerDelegate

extension MainViewController: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    defer { picker.dismiss(animated: true) }

    guard let image = info[.originalImage] as? UIImage else { return }
    inputBox.addImageAttachment(image)
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
  }
}

// MARK: - PHPickerViewControllerDelegate

extension MainViewController: PHPickerViewControllerDelegate {
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    defer { picker.dismiss(animated: true) }

    for result in results {
      if result.itemProvider.canLoadObject(ofClass: UIImage.self) {
        result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
          guard let image = object as? UIImage, error == nil else { return }

          DispatchQueue.main.async {
            self?.inputBox.addImageAttachment(image)
          }
        }
      }
    }
  }
}

// MARK: - UIDocumentPickerDelegate

extension MainViewController: UIDocumentPickerDelegate {
  func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    for url in urls {
      // Start accessing security-scoped resource
      guard url.startAccessingSecurityScopedResource() else { continue }
      defer { url.stopAccessingSecurityScopedResource() }

      // Copy file to temporary directory
      let context = IntelligentContext.shared
      context.prepareTemporaryDirectory()

      let tempURL = context.temporaryDirectory.appendingPathComponent(url.lastPathComponent)

      do {
        // Remove existing file if it exists
        if FileManager.default.fileExists(atPath: tempURL.path) {
          try FileManager.default.removeItem(at: tempURL)
        }

        // Copy file to temporary directory
        try FileManager.default.copyItem(at: url, to: tempURL)

        // Add file attachment using the temporary URL
        try inputBox.addFileAttachment(tempURL)
      } catch {
        let alert = UIAlertController(
          title: "Error",
          message: "Failed to process file: \(error.localizedDescription)",
          preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
      }
    }
  }
}

// MARK: - DocumentPickerViewDelegate

extension MainViewController: DocumentPickerViewDelegate {
  func documentPickerView(_: DocumentPickerView, didSelectDocument document: DocumentItem) {
    // Get current workspace ID
    guard let workspaceId = IntelligentContext.shared.webViewMetadata[.currentWorkspaceId] as? String,
          !workspaceId.isEmpty
    else {
      return
    }

    // Create DocumentAttachment from DocumentItem
    let documentAttachment = DocumentAttachment(
      title: document.title,
      workspaceID: workspaceId,
      documentID: document.id,
      updatedAt: document.updatedAt
    )

    // Add to InputBox
    inputBox.addDocumentAttachment(documentAttachment)

    // Hide document picker
    hideDocumentPicker()
  }
}
