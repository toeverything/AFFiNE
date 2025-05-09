//
//  MarkdownParser+Node.swift
//  FlowMarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import cmark_gfm
import cmark_gfm_extensions
import Foundation

extension MarkdownParser {
  func dumpBlocks(root: UnsafeNode?) {
    guard let root else {
      assertionFailure()
      return
    }
    assert(root.pointee.type == CMARK_NODE_DOCUMENT.rawValue)

    blocks = root.children.compactMap(BlockNode.init(unsafeNode:))
  }
}
