//
//  UserMessageCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation

struct UserMessageCellViewModel: ChatCellViewModel {
  var cellType: CellType = .userMessage
  var id: UUID
  var content: String
  var timestamp: Date
  var attachments: [String] = []
}
