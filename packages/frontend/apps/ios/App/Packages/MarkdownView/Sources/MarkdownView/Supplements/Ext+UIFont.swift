//
//  Ext+UIFont.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import UIKit

public extension UIFont {
  var bold: UIFont {
    UIFont(descriptor: fontDescriptor.withSymbolicTraits(.traitBold)!, size: 0)
  }

  var italic: UIFont {
    UIFont(descriptor: fontDescriptor.withSymbolicTraits(.traitItalic)!, size: 0)
  }

  var monospaced: UIFont {
    let settings = [[
      UIFontDescriptor.FeatureKey.featureIdentifier: kNumberSpacingType,
      UIFontDescriptor.FeatureKey.typeIdentifier: kMonospacedNumbersSelector,
    ]]

    let attributes = [UIFontDescriptor.AttributeName.featureSettings: settings]
    let newDescriptor = fontDescriptor.addingAttributes(attributes)
    return UIFont(descriptor: newDescriptor, size: 0)
  }
}
