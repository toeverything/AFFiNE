//
//  File.swift
//  Intelligents
//
//  Created by 秋星桥 on 4/4/25.
//

import Foundation


public extension Intelligents {
  enum Delegates {
    public static var createNewDocument: ((_ title: String, _ content: String) -> Void) = { _, _ in }
    public static var dismissAll: (() -> Void) = { }
  }
}
