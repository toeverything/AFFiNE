//
//  TaskItemView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class TaskItemView: BlockView {
  let bulletedIcon = CircleView()
  var manifest: Manifest { _manifest as! Manifest }

  let childrenContainer = UIView()
  var childrenViews: [BlockView] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    addSubview(bulletedIcon)
    addSubview(childrenContainer)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    childrenContainer.frame = bounds
    bulletedIcon.frame = manifest.iconRect
    childrenViews.first?.frame = manifest.childrenRect
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

extension TaskItemView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      childrenGroup.intrinsicWidth + iconLayoutGuideRect.width
    }

    var iconLayoutGuideRect: CGRect {
      .init(x: 0, y: 0, width: sizes.bullet + spacings.list, height: fonts.body.baseLineHeight)
    }

    var iconRect: CGRect = .zero
    let childrenGroup: GroupBlockView.Manifest = .init()
    var childrenRect: CGRect = .zero

    var childrenGroupWidth: CGFloat {
      max(0, size.width - iconLayoutGuideRect.width)
    }

    required init() {
      childrenGroup.overrideGroupSpacing = 0
    }

    func load(block _: BlockNode) {
      assertionFailure("should not be called")
    }

    func setItems(_ items: RawTaskListItem) {
      dirty = true
      childrenGroup.setChildren(nodes: items.children)
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
      let iconLayoutGuideRect = iconLayoutGuideRect

      childrenGroup.layoutIfNeeded()
      size.height = max(iconLayoutGuideRect.height, childrenGroup.size.height)
      iconRect = CGRect(
        x: 0,
        y: (iconLayoutGuideRect.height - sizes.bullet) / 2,
        width: sizes.bullet,
        height: sizes.bullet
      )
      childrenRect = CGRect(
        x: iconLayoutGuideRect.maxX,
        y: 0,
        width: childrenGroup.size.width,
        height: childrenGroup.size.height
      )
    }

    func determineViewType() -> BlockView.Type {
      TaskItemView.self
    }
  }
}
