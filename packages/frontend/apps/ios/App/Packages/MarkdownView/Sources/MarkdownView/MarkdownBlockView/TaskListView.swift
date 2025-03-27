//
//  TaskListView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class TaskListView: BlockView {
  var manifest: Manifest { _manifest as! Manifest }

  let childrenContainer = UIView()
  var childrenViews: [BlockView] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    addSubview(childrenContainer)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    childrenContainer.frame = bounds
    childrenViews.first?.frame = manifest.childrenGroupRect
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

extension TaskListView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      childrenGroup.intrinsicWidth
    }

    required init() {
      childrenGroup.overrideGroupSpacing = 0
    }

    let childrenGroup: GroupBlockView.Manifest = .init()
    var childrenGroupRect: CGRect = .zero

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case let .taskList(_, items) = block else {
        assertionFailure()
        return
      }
      childrenGroup.setChildren(manifests: items.map { listItem in
        let manifest = TaskItemView.Manifest()
        manifest.setItems(listItem)
        return manifest
      })
      childrenGroup.setLayoutWidth(size.width)
    }

    func setLayoutWidth(_ width: CGFloat) {
      guard size.width != width else { return }
      assert(width >= 0)
      dirty = true
      size.width = width
      childrenGroup.setLayoutWidth(width)
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
      size.height = childrenGroup.size.height
      childrenGroupRect = CGRect(
        x: 0,
        y: 0,
        width: size.width,
        height: size.height
      )
    }

    func determineViewType() -> BlockView.Type {
      TaskListView.self
    }
  }
}
