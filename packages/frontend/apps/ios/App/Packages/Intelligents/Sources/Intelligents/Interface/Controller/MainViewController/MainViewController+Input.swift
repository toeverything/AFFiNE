//
//  MainViewController+Input.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import PhotosUI
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
        inputBox.addFileAttachment(tempURL)
      } catch {
        print("Failed to copy file: \(error)")
      }
    }
  }
}
