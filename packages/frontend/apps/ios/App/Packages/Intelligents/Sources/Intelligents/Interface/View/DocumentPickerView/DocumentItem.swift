//
//  DocumentItem.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

struct DocumentItem: Hashable {
  let id: String
  let title: String
  let updatedAt: Date?

  init(id: String, title: String, updatedAt: Date? = nil) {
    self.id = id
    self.title = title
    self.updatedAt = updatedAt
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(id)
  }

  static func == (lhs: DocumentItem, rhs: DocumentItem) -> Bool {
    lhs.id == rhs.id
  }
}
