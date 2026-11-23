//
//  ChatManager+Closable.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import Foundation

protocol Closable { func close() }

class ClosableTask: Closable {
  let detachedTask: Task<Void, Never>
  init(detachedTask: Task<Void, Never>) {
    self.detachedTask = detachedTask
  }

  func close() {
    detachedTask.cancel()
  }
}
