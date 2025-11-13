//
//  ChatItemEntity.swift
//  Intelligents
//
//  Created by 秋星桥 on 7/2/25.
//

import Foundation
import UIKit

struct ChatItemEntity: Identifiable, Hashable, Equatable {
  var id: UUID
  var object: any ChatCellViewModel

  static func == (lhs: ChatItemEntity, rhs: ChatItemEntity) -> Bool {
    lhs.id == rhs.id && lhs.object.cellType == rhs.object.cellType && lhs.object.hashValue == rhs.object.hashValue
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(id)
    hasher.combine(object.cellType)
    hasher.combine(object.hashValue)
  }
}
