//
//  ParagraphView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class ParagraphView: BlockView {
  let text = TextLabel()
  var manifest: Manifest { _manifest as! Manifest }

  override func viewDidLoad() {
    super.viewDidLoad()
    addSubview(text)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    text.frame = manifest.contentRect
  }

  override func viewDidUpdate() {
    super.viewDidUpdate()
    text.attributedText = manifest.content
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension ParagraphView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      content.measureWidth()
    }

    var content: NSMutableAttributedString = .init()
    var contentRect: CGRect = .zero

    required init() {}

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case let .paragraph(contents) = block else {
        assertionFailure()
        return
      }
      content = contents.render(theme: theme)
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      let textHeight = content.measureHeight(usingWidth: size.width)
      contentRect = .init(x: 0, y: 0, width: size.width, height: textHeight)
      size.height = textHeight
    }

    func determineViewType() -> BlockView.Type {
      ParagraphView.self
    }
  }
}
