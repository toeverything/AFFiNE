//
//  UIView+createViewSnapshot.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import UIKit

public extension UIView {
  func createViewSnapshot() -> UIImage {
    let renderer = UIGraphicsImageRenderer(bounds: bounds)
    return renderer.image { context in
      // clear the background
      context.cgContext.setFillColor(UIColor.clear.cgColor)
      context.cgContext.fill(bounds)

      // MUST USE DRAW HIERARCHY TO RENDER VISUAL EFFECT VIEW
      self.drawHierarchy(in: bounds, afterScreenUpdates: false)
    }
  }
}
