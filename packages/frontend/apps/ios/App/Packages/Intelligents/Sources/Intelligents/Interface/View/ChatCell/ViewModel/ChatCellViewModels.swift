//
//  ChatCellViewModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

protocol ChatCellViewModel: Codable, Identifiable, Equatable, Hashable {
  var cellType: CellType { get }
  var id: String { get }
}

struct UserMessageCellViewModel: ChatCellViewModel {
  var cellType: CellType = .userMessage
  var id: String
  var content: String
  var attachments: [AttachmentViewModel]
  var timestamp: Date?
  var isRetrying: Bool
}

struct AssistantMessageCellViewModel: ChatCellViewModel {
  var cellType: CellType = .assistantMessage
  var id: String
  var content: String
  var attachments: [AttachmentViewModel]
  var timestamp: Date?
  var isStreaming: Bool
  var model: String?
  var tokens: Int?
  var canRetry: Bool
}

struct SystemMessageCellViewModel: ChatCellViewModel {
  var cellType: CellType = .systemMessage
  var id: String
  var content: String
  var timestamp: Date?
}
