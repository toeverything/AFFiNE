//
//  BulletedItemView 2.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class NumberedItemView: BlockView {
  let numberView = TextLabel()
  var manifest: Manifest { _manifest as! Manifest }

  let childrenContainer = UIView()
  var childrenViews: [BlockView] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    numberView.textAlignment = .left
    numberView.font = .preferredFont(forTextStyle: .body)
    numberView.textColor = .label
    addSubview(numberView)
    addSubview(childrenContainer)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    childrenContainer.frame = bounds
    numberView.frame = manifest.iconRect
    childrenViews.first?.frame = manifest.childrenRect
  }

  override func viewDidUpdate() {
    super.viewDidUpdate()
    numberView.attributedText = manifest.number
    childrenContainer.diffableUpdate(
      reusingViews: &childrenViews,
      manifests: [manifest.childrenGroup]
    )
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension NumberedItemView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      childrenGroup.intrinsicWidth + iconLayoutGuideRect.width
    }

    var number: NSAttributedString = .init()
    var iconRect: CGRect = .zero
    let childrenGroup: GroupBlockView.Manifest = .init()
    var childrenRect: CGRect = .zero

    var iconWidth: CGFloat {
      "99.".size(withAttributes: [.font: theme.fonts.body]).width
    }

    var iconLayoutGuideRect: CGRect {
      .init(x: 0, y: 0, width: iconWidth + spacings.list, height: fonts.body.baseLineHeight)
    }

    var childrenGroupWidth: CGFloat {
      max(0, size.width - iconLayoutGuideRect.width)
    }

    required init() {
      childrenGroup.overrideGroupSpacing = 0
    }

    func load(block _: BlockNode) {
      assertionFailure("should not be called")
    }

    func setNumber(_ number: Int) {
      dirty = true
      self.number = NSMutableAttributedString(string: "\(number).", attributes: [
        .font: theme.fonts.body,
        .originalFont: theme.fonts.body,
        .foregroundColor: UIColor.label,
      ])
    }

    func setItems(_ items: RawListItem) {
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

      childrenGroup.setLayoutWidth(childrenGroupWidth)
      childrenGroup.layoutIfNeeded()
      size.height = max(iconLayoutGuideRect.height, childrenGroup.size.height)
      iconRect = CGRect(
        x: 0,
        y: (iconLayoutGuideRect.height - iconLayoutGuideRect.height) / 2,
        width: iconWidth,
        height: iconLayoutGuideRect.height
      )
      childrenRect = CGRect(
        x: iconLayoutGuideRect.maxX,
        y: 0,
        width: childrenGroup.size.width,
        height: childrenGroup.size.height
      )
    }

    func determineViewType() -> BlockView.Type {
      NumberedItemView.self
    }
  }
}
