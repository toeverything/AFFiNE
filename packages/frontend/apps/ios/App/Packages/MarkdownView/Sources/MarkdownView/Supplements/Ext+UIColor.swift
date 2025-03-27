//
//  Ext+UIColor.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/7.
//

import UIKit

extension UIColor {
  convenience init(light: UIColor, dark: UIColor) {
    if #available(iOS 13.0, tvOS 13.0, *) {
      self.init(dynamicProvider: { $0.userInterfaceStyle == .dark ? dark : light })
    } else {
      self.init(cgColor: light.cgColor)
    }
  }
}
