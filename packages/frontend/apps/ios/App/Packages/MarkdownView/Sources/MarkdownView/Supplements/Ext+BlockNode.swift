//
//  Ext+BlockNode.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation
import MarkdownParser

public extension BlockNode {
  var manifestType: BlockManifest.Type {
    switch self {
    case .blockquote:
      BlockquoteView.Manifest.self
    case .bulletedList:
      BulletedListView.Manifest.self
    case .numberedList:
      NumberedListView.Manifest.self
    case .taskList:
      TaskListView.Manifest.self
    case .codeBlock:
      CodeBlockView.Manifest.self
//        case .htmlBlock:
//            HTMLBlockView.Manifest.self
    case .paragraph:
      ParagraphView.Manifest.self
    case .heading:
      HeadingView.Manifest.self
    case .table:
      TableView.Manifest.self
    case .thematicBreak:
      ThematicBreakView.Manifest.self
    }
  }

  func manifest(theme: Theme) -> AnyBlockManifest {
    let object = manifestType.init()
    object.setLayoutTheme(theme)
    object.load(block: self)
    return object
  }
}
