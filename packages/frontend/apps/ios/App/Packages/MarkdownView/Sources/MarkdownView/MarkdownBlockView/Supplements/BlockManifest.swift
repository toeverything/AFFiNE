//
//  BlockManifest.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

public typealias AnyBlockManifest = any BlockManifest

public protocol BlockManifest: AnyObject {
  var size: CGSize { get set }
  var theme: Theme { get set }
  var dirty: Bool { get set }

  var intrinsicWidth: CGFloat { get }

  init()

  func setLayoutWidth(_ width: CGFloat)
  func setLayoutTheme(_ theme: Theme)
  func load(block: BlockNode)
  func layoutIfNeeded()

  @inline(__always) func determineViewType() -> BlockView.Type
}

public extension BlockManifest {
  func setLayoutWidth(_ width: CGFloat) {
    guard size.width != width else { return }
    assert(width >= 0)
    size.width = width
    size.height = .zero
    dirty = true
  }

  func setLayoutTheme(_ theme: Theme) {
    guard self.theme != theme else { return }
    self.theme = theme
    dirty = true
  }

  func layoutIfNeeded() {
    dirty = false
  }
}

extension BlockManifest {
  var fonts: Theme.Fonts { theme.fonts }
  var colors: Theme.Colors { theme.colors }
  var spacings: Theme.Spacings { theme.spacings }
  var sizes: Theme.Sizes { theme.sizes }
}
