//
//  Ext+Array.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation

extension Array {
  subscript(safe index: Int) -> Element? {
    guard index >= 0, index < count else { return nil }
    return self[index]
  }
}
