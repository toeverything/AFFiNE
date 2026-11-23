//
//  CCVM+User.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation

struct UserMessageCellViewModel: ChatCellViewModel {
  var cellType: ChatCellType = .userMessage
  var id: UUID
  var content: String
  var timestamp: Date
}

struct UserHintCellViewModel: ChatCellViewModel {
  var cellType: ChatCellType = .userAttachmentsHint
  var id: UUID
  var timestamp: Date
  var imageAttachments: [ImageAttachment]
  var fileAttachments: [FileAttachment]
  var docAttachments: [DocumentAttachment]
}
