//
//  Ext+NSAttributedString.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import UIKit

class TextMeasurementHelper {
  static let shared = TextMeasurementHelper()

  private var textStorage: NSTextStorage
  private var textContainer: NSTextContainer
  private var layoutManager: NSLayoutManager

  private let lock = NSLock()

  init() {
    textStorage = NSTextStorage()
    textContainer = NSTextContainer(size: CGSize(width: CGFloat.infinity, height: CGFloat.infinity))
    layoutManager = NSLayoutManager()
    layoutManager.addTextContainer(textContainer)
    textStorage.addLayoutManager(layoutManager)
    textContainer.lineFragmentPadding = 0
  }

  func measureSize(
    of attributedString: NSAttributedString,
    usingWidth width: CGFloat,
    lineLimit: Int = 0,
    lineBreakMode: NSLineBreakMode = .byTruncatingTail
  ) -> CGSize {
    lock.lock()
    defer { lock.unlock() }

    textContainer.size = CGSize(width: width, height: .infinity)
    textContainer.maximumNumberOfLines = lineLimit
    textContainer.lineBreakMode = lineBreakMode
    textStorage.beginEditing()
    textStorage.setAttributedString(attributedString)
    textStorage.endEditing()

    let size = layoutManager.usedRect(for: textContainer).size
    return .init(width: ceil(size.width), height: ceil(size.height))
  }
}

extension NSAttributedString: @unchecked @retroactive Sendable {}

public extension NSAttributedString {
  func measureWidth() -> CGFloat {
    if string.trimmingCharacters(in: .whitespacesAndNewlines).count <= 0 {
      return 0
    }
    return TextMeasurementHelper.shared.measureSize(
      of: self,
      usingWidth: .infinity
    ).width
  }

  func measureHeight(
    usingWidth width: CGFloat,
    lineLimit: Int = 0,
    lineBreakMode: NSLineBreakMode = .byTruncatingTail
  ) -> CGFloat {
    if string.trimmingCharacters(in: .whitespacesAndNewlines).count <= 0 {
      return 0
    }

    return TextMeasurementHelper.shared.measureSize(
      of: self,
      usingWidth: width,
      lineLimit: lineLimit,
      lineBreakMode: lineBreakMode
    ).height
  }
}

public extension NSAttributedString.Key {
  @inline(__always) static let coreTextRunDelegate = NSAttributedString.Key(rawValue: kCTRunDelegateAttributeName as String)
  @inline(__always) static let originalFont = NSAttributedString.Key(rawValue: "NSOriginalFont")
}
