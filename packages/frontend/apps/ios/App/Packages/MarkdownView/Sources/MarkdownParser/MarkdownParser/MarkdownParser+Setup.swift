//
//  MarkdownParser+Setup.swift
//  FlowMarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import cmark_gfm
import cmark_gfm_extensions

import Foundation

extension MarkdownParser {
  func setupExtensions(parser: UnsafeMutablePointer<cmark_parser>) {
    cmark_gfm_core_extensions_ensure_registered()
    let extensionNames = ["autolink", "strikethrough", "tagfilter", "tasklist", "table"]
    for extensionName in extensionNames {
      guard let syntaxExtension = cmark_find_syntax_extension(extensionName) else {
        assertionFailure()
        continue
      }
      cmark_parser_attach_syntax_extension(parser, syntaxExtension)
    }
  }
}
