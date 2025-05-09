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

private let maxConcurrentDefaultValue: Int = max(1, ProcessInfo.processInfo.processorCount)

extension Array {
  @inline(__always)
  func splitInSubArrays(into size: Int) -> [[Element]] {
    (0 ..< size).map {
      stride(from: $0, to: count, by: size).map { self[$0] }
    }
  }

  func forParallelEach(
    maxConcurrent: Int = maxConcurrentDefaultValue,
    block: @escaping (Element) -> Void
  ) {
    assert(maxConcurrent > 0)
    if count < maxConcurrent || maxConcurrent <= 1 {
      for element in self {
        block(element)
      }
      return
    }

    let cuts = splitInSubArrays(into: maxConcurrent)

    let group = DispatchGroup()
    for cut in cuts {
      group.enter()
      DispatchQueue.global().async {
        cut.forEach(block)
        group.leave()
      }
    }
    group.wait()
  }
}
