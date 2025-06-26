//
//  ChatMessage.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

struct ChatMessage: Codable, Identifiable, Equatable, Hashable {
  var id: String?
  var role: MessageRole
  var content: String
  var attachments: [String]?
  var params: [String: String]?
  var createdAt: DateTime?

  var createdDate: Date? {
    createdAt?.decoded
  }

  var messageId: String {
    id ?? UUID().uuidString
  }
}

extension ChatMessage {
  enum MessageRole: String, Codable, CaseIterable {
    case user
    case assistant
    case system
  }
}

struct SessionViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var workspaceId: String
  var docId: String?
  var promptName: String
  var model: String?
  var pinned: Bool
  var tokens: Int
  var createdAt: DateTime?
  var updatedAt: DateTime?
  var parentSessionId: String?

  var createdDate: Date? {
    createdAt?.decoded
  }

  var updatedDate: Date? {
    updatedAt?.decoded
  }
}
