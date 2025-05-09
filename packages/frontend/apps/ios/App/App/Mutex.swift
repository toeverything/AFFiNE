//
//  Mutex.swift
//  App
//
//  Created by EYHN on 2025/1/11.
//

import Foundation

final class Mutex<Wrapped>: @unchecked Sendable {
  private let lock = NSLock.init()
  private var wrapped: Wrapped
  
  init(_ wrapped: Wrapped) {
    self.wrapped = wrapped
  }
  
  func withLock<R>(_ body: @Sendable (inout Wrapped) throws -> R) rethrows -> R {
    self.lock.lock()
    defer { self.lock.unlock() }
    return try body(&wrapped)
  }
}
