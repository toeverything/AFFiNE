//
//  IntelligentsFocusApertureView+Capture.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/21.
//

import UIKit

extension IntelligentsFocusApertureView {
  func captureImageBuffer(_ targetContentView: UIView) {
    let contentSize = targetContentView.frame.size

    let renderer = UIGraphicsImageRenderer(size: contentSize)
    let image = renderer.image { _ in
      let drawRect = CGRect(
        x: 0,
        y: 0,
        width: contentSize.width,
        height: contentSize.height
      )

      targetContentView.drawHierarchy(
        in: drawRect,
        afterScreenUpdates: true
      )
    }
    capturedImage = image
  }
}
