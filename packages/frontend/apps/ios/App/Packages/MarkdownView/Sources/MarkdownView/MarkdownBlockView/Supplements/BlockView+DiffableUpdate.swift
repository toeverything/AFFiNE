//
//  BlockView+DiffableUpdate.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation
import UIKit

extension UIView {
  func diffableUpdate(reusingViews blockViews: inout [BlockView], manifests: [AnyBlockManifest]) {
    defer {
      assert(blockViews.count == manifests.count, "blockViews count must match manifests count")
    }
    var shouldRemovedIndices: [Int] = []
    defer {
      for index in shouldRemovedIndices.sorted(by: >) {
        blockViews.remove(at: index)
      }
    }
    for idx in 0 ..< max(blockViews.count, manifests.count) {
      guard let manifest = manifests[safe: idx] else {
        if let view = blockViews[safe: idx] {
          view.removeFromSuperview()
          shouldRemovedIndices.append(idx)
        }
        continue
      }
      lazy var view = {
        let view = manifest.determineViewType().init(manifest: manifest)
        addSubview(view)
        return view
      }()
      if let currentView = blockViews[safe: idx] {
        if currentView.accept(manifest) {
          currentView.set(manifest)
          continue
        } else {
          currentView.removeFromSuperview()
          blockViews[idx] = view
        }
      } else {
        addSubview(view)
        blockViews.insert(view, at: idx)
      }
    }
  }
}
