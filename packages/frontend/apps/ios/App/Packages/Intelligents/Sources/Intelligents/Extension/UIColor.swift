//
//  UIColor.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import UIKit

private extension UIColor {
  convenience init(hex: Int, alpha: CGFloat = 1.0) {
    self.init(
      red: CGFloat((hex & 0xFF0000) >> 16) / 255.0,
      green: CGFloat((hex & 0x00FF00) >> 8) / 255.0,
      blue: CGFloat(hex & 0x0000FF) / 255.0,
      alpha: alpha
    )
  }
}
