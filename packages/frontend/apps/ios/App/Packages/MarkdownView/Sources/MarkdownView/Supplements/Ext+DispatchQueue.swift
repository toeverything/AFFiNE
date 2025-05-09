//
//  Ext+DispatchQueue.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation

public extension DispatchQueue {
  static func isCurrent(_ queue: DispatchQueue) -> Bool {
    let key = DispatchSpecificKey<Void>()
    queue.setSpecific(key: key, value: ())
    defer { queue.setSpecific(key: key, value: nil) }
    return DispatchQueue.getSpecific(key: key) != nil
  }
}
