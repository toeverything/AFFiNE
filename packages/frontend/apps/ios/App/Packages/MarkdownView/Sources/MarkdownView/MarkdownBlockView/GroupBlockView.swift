//
//  GroupBlockView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class GroupBlockView: BlockView {
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
    for (index, view) in childrenViews.enumerated() {
      view.frame = manifest.children[index].rect
    }
  }

  override func viewDidUpdate() {
    childrenContainer.diffableUpdate(
      reusingViews: &childrenViews,
      manifests: manifest.children.map(\.manifest)
    )
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension GroupBlockView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      children.map(\.manifest.intrinsicWidth).max() ?? 0
    }

    var overrideGroupSpacing: CGFloat? = nil {
      didSet { dirty = true }
    }

    var spacing: CGFloat {
      if let overrideGroupSpacing { return overrideGroupSpacing }
      return theme.spacings.general
    }

    required init() {}

    func load(block _: BlockNode) {
      assertionFailure("should not be called")
    }

    var children: [Child] = [] {
      didSet { dirty = true }
    }

    func setLayoutWidth(_ width: CGFloat) {
      guard size.width != width else { return }
      assert(width >= 0)
      dirty = true
      size.width = width
      children.forEach { $0.manifest.setLayoutWidth(width) }
    }

    func setChildren(manifests: [AnyBlockManifest]) {
      dirty = true
      children = manifests.map { Child(manifest: $0) }
    }

    func setChildren(nodes: [BlockNode]) {
      setChildren(manifests: nodes.map { $0.manifest(theme: theme) })
    }

    func setLayoutTheme(_ theme: Theme) {
      guard self.theme != theme else { return }
      dirty = true
      self.theme = theme
      children.forEach { $0.manifest.setLayoutTheme(theme) }
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      var anchor: CGFloat = 0
      for child in children {
        child.manifest.setLayoutWidth(size.width)
        child.manifest.layoutIfNeeded()
        child.rect = CGRect(
          x: 0,
          y: anchor + spacing,
          width: child.manifest.size.width,
          height: child.manifest.size.height
        )
        anchor = child.rect.maxY
      }
      size.height = anchor
    }

    func determineViewType() -> BlockView.Type {
      GroupBlockView.self
    }
  }
}

extension GroupBlockView.Manifest {
  class Child {
    let manifest: AnyBlockManifest
    var rect: CGRect

    init(manifest: AnyBlockManifest, rect: CGRect = .zero) {
      self.manifest = manifest
      self.rect = rect
    }
  }

  func build(reusingChildren: [Child], forManifests manifests: [AnyBlockManifest]) -> [Child] {
    var ans = [Child]()
    for idx in manifests.indices {
      let manifest = manifests[idx]
      if let child = reusingChildren[safe: idx], type(of: child.manifest) == type(of: manifest) {
        ans.append(child)
      } else {
        ans.append(Child(manifest: manifest))
      }
    }
    return ans
  }
}
