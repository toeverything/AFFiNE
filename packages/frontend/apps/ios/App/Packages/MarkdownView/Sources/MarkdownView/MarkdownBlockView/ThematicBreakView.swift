//
//  ThematicBreakView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class ThematicBreakView: BlockView {
  let separateView = UIView()

  override func viewDidLoad() {
    super.viewDidLoad()
    addSubview(separateView)
    separateView.backgroundColor = .label.withAlphaComponent(0.1)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    separateView.frame = bounds
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension ThematicBreakView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      32
    }

    required init() {}

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case .thematicBreak = block else {
        assertionFailure()
        return
      }
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      size.height = 1
    }

    func determineViewType() -> BlockView.Type {
      ThematicBreakView.self
    }
  }
}
