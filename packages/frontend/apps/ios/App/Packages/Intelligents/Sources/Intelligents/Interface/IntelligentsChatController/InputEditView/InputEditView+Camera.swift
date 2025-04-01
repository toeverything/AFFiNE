//
//  InputEditView+Camera.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/12/6.
//

import AVKit
import UIKit

extension InputEditView: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  @objc func takePhoto() {
    AVCaptureDevice.requestAccess(for: .video) { _ in
      DispatchQueue.main.async {
        let ctrl = UIImagePickerController()
        ctrl.allowsEditing = false
        ctrl.sourceType = .camera
        ctrl.mediaTypes = [UTType.movie.identifier, UTType.image.identifier]
        ctrl.cameraCaptureMode = .photo
        ctrl.delegate = self
        self.parentViewController?.present(ctrl, animated: true)
      }
    }
  }

  private func processJPEGImageData(_ image: UIImage) throws -> Data? {
    guard let data = image.jpegData(compressionQuality: 0.75) else {
      throw UnableTo.compressImage
    }
    return data
  }

  func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    picker.dismiss(animated: true) {
      var itemUrl: URL?

      if itemUrl == nil,
         let image = info[.editedImage] as? UIImage ?? info[.originalImage] as? UIImage
      {
        let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
          .appendingPathComponent("Camera")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let tempFile = tempDir
          .appendingPathComponent(UUID().uuidString)
          .appendingPathExtension("jpeg")
        try? self.processJPEGImageData(image)?.write(to: tempFile)
        itemUrl = tempFile
      }
      if itemUrl == nil,
         let url = info[.mediaURL] as? URL
      {
        itemUrl = url
      }

      guard let url = itemUrl, FileManager.default.fileExists(atPath: url.path) else {
        return
      }
      guard let image = UIImage(contentsOfFile: url.path) else { return }
      try? FileManager.default.removeItem(at: url)
      self.viewModel.attachments.append(image)
    }
  }
}
