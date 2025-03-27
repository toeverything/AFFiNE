//
//  Ext+InlineNode.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation
import MarkdownParser
import UIKit

extension [InlineNode] {
  func render(theme: Theme) -> NSMutableAttributedString {
    let result = NSMutableAttributedString()
    for node in self {
      result.append(node.render(theme: theme))
    }
    return result
  }
}

extension InlineNode {
  func render(theme: Theme) -> NSAttributedString {
    switch self {
    case let .text(string):
      return NSAttributedString(
        string: string,
        attributes: [
          .font: theme.fonts.body,
          .foregroundColor: theme.colors.body,
          .originalFont: theme.fonts.body,
        ]
      )
    case .softBreak:
      return NSAttributedString(string: " ", attributes: [
        .font: theme.fonts.body,
        .foregroundColor: theme.colors.body,
        .originalFont: theme.fonts.body,
      ])
    case .lineBreak:
      return NSAttributedString(string: "\n", attributes: [
        .font: theme.fonts.body,
        .foregroundColor: theme.colors.body,
        .originalFont: theme.fonts.body,
      ])
    case let .code(string):
      return NSAttributedString(
        string: "\(string)",
        attributes: [
          .font: theme.fonts.codeInline,
          .originalFont: theme.fonts.codeInline,
          .foregroundColor: theme.colors.code,
          .backgroundColor: theme.colors.codeBackground.withAlphaComponent(0.05),
        ]
      )
    case let .html(content):
      return NSAttributedString(
        string: "\(content)",
        attributes: [
          .font: theme.fonts.codeInline,
          .originalFont: theme.fonts.codeInline,
          .foregroundColor: theme.colors.code,
          .backgroundColor: theme.colors.codeBackground.withAlphaComponent(0.05),
        ]
      )
//            let htmlData = NSString(string: content).data(using: String.Encoding.unicode.rawValue)
//            let options = [NSAttributedString.DocumentReadingOptionKey.documentType: NSAttributedString.DocumentType.html]
//            let ans = try? NSMutableAttributedString(
//                data: htmlData ?? Data(),
//                options: options,
//                documentAttributes: nil
//            )
//            return ans ?? .init()
    case let .emphasis(children):
      let ans = NSMutableAttributedString()
      children.map { $0.render(theme: theme) }.forEach { ans.append($0) }
      ans.addAttributes(
        [
          .underlineStyle: NSUnderlineStyle.thick.rawValue,
          .underlineColor: theme.colors.emphasis,
        ],
        range: NSRange(location: 0, length: ans.length)
      )
      return ans
    case let .strong(children):
      let ans = NSMutableAttributedString()
      children.map { $0.render(theme: theme) }.forEach { ans.append($0) }
      ans.addAttributes(
        [.font: theme.fonts.bold],
        range: NSRange(location: 0, length: ans.length)
      )
      return ans
    case let .strikethrough(children):
      let ans = NSMutableAttributedString()
      children.map { $0.render(theme: theme) }.forEach { ans.append($0) }
      ans.addAttributes(
        [.strikethroughStyle: NSUnderlineStyle.thick.rawValue],
        range: NSRange(location: 0, length: ans.length)
      )
      return ans
    case let .link(destination, children):
      let ans = NSMutableAttributedString()
      children.map { $0.render(theme: theme) }.forEach { ans.append($0) }
      ans.addAttributes(
        [.link: destination],
        range: NSRange(location: 0, length: ans.length)
      )
      return ans
    case let .image(source, _): // children => alternative text can be ignored?
      return NSAttributedString(
        string: source,
        attributes: [
          .link: source,
          .font: theme.fonts.body,
          .originalFont: theme.fonts.body,
          .foregroundColor: theme.colors.body,
        ]
      )
    }
  }
}
