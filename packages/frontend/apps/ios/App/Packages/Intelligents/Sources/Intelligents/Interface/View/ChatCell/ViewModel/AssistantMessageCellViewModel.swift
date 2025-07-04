//
//  AssistantMessageCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation

struct AssistantMessageCellViewModel: ChatCellViewModel {
  var cellType: CellType = .assistantMessage
  var id: UUID
  var content: String
  var timestamp: Date
  var isStreaming: Bool = false
  var model: String?
  var tokens: Int?
  var canRetry: Bool = false
  var citations: [CitationViewModel]?
  var actions: [MessageActionViewModel]?
}

struct CitationViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var title: String
  var url: String?
  var snippet: String?
}

struct MessageActionViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var title: String
  var actionType: ActionType
  var data: [String: String]?

  enum ActionType: String, Codable {
    case copy
    case regenerate
    case like
    case dislike
    case share
    case edit
  }
}
