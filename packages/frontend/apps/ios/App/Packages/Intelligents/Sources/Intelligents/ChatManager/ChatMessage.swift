//
//  ChatMessage.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

public struct ChatMessage: Codable, Identifiable, Equatable, Hashable {
  public var id: String?
  public var role: MessageRole
  public var content: String
  public var attachments: [String]?
  public var params: [String: String]?
  public var createdAt: DateTime?

  public var createdDate: Date? {
    createdAt?.decoded
  }

  public var messageId: String {
    id ?? UUID().uuidString
  }

  public init(
    id: String? = nil,
    role: MessageRole,
    content: String,
    attachments: [String]? = nil,
    params: [String: String]? = nil,
    createdAt: DateTime? = nil
  ) {
    self.id = id
    self.role = role
    self.content = content
    self.attachments = attachments
    self.params = params
    self.createdAt = createdAt
  }
}

public extension ChatMessage {
  enum MessageRole: String, Codable, CaseIterable {
    case user
    case assistant
    case system
  }
}

public struct SessionViewModel: Codable, Identifiable, Equatable, Hashable {
  public var id: String
  public var workspaceId: String
  public var docId: String?
  public var promptName: String
  public var model: String?
  public var pinned: Bool
  public var tokens: Int
  public var createdAt: DateTime?
  public var updatedAt: DateTime?
  public var parentSessionId: String?

  public var createdDate: Date? {
    createdAt?.decoded
  }

  public var updatedDate: Date? {
    updatedAt?.decoded
  }

  public init(
    id: String,
    workspaceId: String,
    docId: String? = nil,
    promptName: String,
    model: String? = nil,
    pinned: Bool,
    tokens: Int,
    createdAt: DateTime? = nil,
    updatedAt: DateTime? = nil,
    parentSessionId: String? = nil
  ) {
    self.id = id
    self.workspaceId = workspaceId
    self.docId = docId
    self.promptName = promptName
    self.model = model
    self.pinned = pinned
    self.tokens = tokens
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.parentSessionId = parentSessionId
  }
}
