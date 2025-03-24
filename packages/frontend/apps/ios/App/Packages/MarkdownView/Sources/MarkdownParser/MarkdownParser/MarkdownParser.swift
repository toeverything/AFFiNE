//
//  MarkdownParser.swift
//  FlowMarkdownView
//
//  Created by 秋星桥 on 2025/1/2.
//

import cmark_gfm
import cmark_gfm_extensions
import Foundation

public class MarkdownParser {
  public internal(set) var blocks: [BlockNode] = [] {
    didSet { delegate?.updateBlockNodes(blocks) }
  }

  public weak var delegate: Delegate?
  var currentDoc = String()

  public init() {}

  @discardableResult
  public func feed(_ text: String) -> [BlockNode] {
    currentDoc += text
    let parser = cmark_parser_new(CMARK_OPT_DEFAULT)!
    defer { cmark_parser_free(parser) }
    setupExtensions(parser: parser)
    cmark_parser_feed(parser, currentDoc, currentDoc.utf8.count)
    let node = cmark_parser_finish(parser)
    defer { cmark_node_free(node) }
    dumpBlocks(root: node)
    return blocks
  }
}
