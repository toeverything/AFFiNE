//
//  BlockquoteView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class BlockquoteView: BlockView {
  var manifest: Manifest { _manifest as! Manifest }

  let backgroundView = UIView()
  let childrenContainer = UIView()
  var childrenViews: [BlockView] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    addSubview(backgroundView)
    backgroundView.backgroundColor = .gray.withAlphaComponent(0.05)
    backgroundView.layer.cornerRadius = 8
    backgroundView.clipsToBounds = true
    backgroundView.layer.masksToBounds = true
    addSubview(childrenContainer)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    backgroundView.frame = bounds
    childrenViews.first?.frame = manifest.childrenGroupRect
    childrenContainer.frame = bounds
  }

  override func viewDidUpdate() {
    super.viewDidUpdate()
    childrenContainer.diffableUpdate(
      reusingViews: &childrenViews,
      manifests: [manifest.childrenGroup]
    )
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension BlockquoteView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var childrenGroupWidth: CGFloat {
      max(0, size.width - spacings.general * 2)
    }

    var intrinsicWidth: CGFloat {
      childrenGroup.intrinsicWidth + spacings.general * 2
    }

    let childrenGroup: GroupBlockView.Manifest = .init()
    var childrenGroupRect: CGRect = .zero

    required init() {}

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case let .blockquote(children) = block else {
        assertionFailure()
        return
      }
      childrenGroup.setChildren(nodes: children)
    }

    func setLayoutWidth(_ width: CGFloat) {
      guard size.width != width else { return }
      assert(width >= 0)
      dirty = true
      size.width = width
      childrenGroup.setLayoutWidth(childrenGroupWidth)
    }

    func setLayoutTheme(_ theme: Theme) {
      guard self.theme != theme else { return }
      dirty = true
      self.theme = theme
      childrenGroup.setLayoutTheme(theme)
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      childrenGroup.layoutIfNeeded()
      size.height = childrenGroup.size.height + spacings.general * 2
      childrenGroupRect = CGRect(
        x: spacings.general,
        y: spacings.general,
        width: childrenGroup.size.width,
        height: childrenGroup.size.height
      )
    }

    func determineViewType() -> BlockView.Type {
      BlockquoteView.self
    }
  }
}
