//
//  ChatManager+WorkflowModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

// MARK: - ChatManager Workflow Models Extension

public extension ChatManager {
  // MARK: - Workflow Models

  struct WorkflowEventData: Codable, Identifiable, Equatable, Hashable {
    public var id: String
    public var status: String
    public var type: String
    public var title: String
    public var content: String
    public var progress: Double?
    public var timestamp: Date?

    init(status: String, type: String, title: String, content: String, progress: Double? = nil, timestamp: Date? = nil) {
      id = UUID().uuidString
      self.status = status
      self.type = type
      self.title = title
      self.content = content
      self.progress = progress
      self.timestamp = timestamp
    }
  }

  struct WorkspaceEmbeddingStatus: Codable, Identifiable, Equatable, Hashable {
    public var id: String
    public var workspaceId: String
    public var total: Int
    public var embedded: Int

    public var progress: Double {
      total > 0 ? Double(embedded) / Double(total) : 0.0
    }

    init(workspaceId: String, total: Int, embedded: Int) {
      id = workspaceId
      self.workspaceId = workspaceId
      self.total = total
      self.embedded = embedded
    }
  }

  struct ChatEvent: Codable, Identifiable, Equatable, Hashable {
    public var id: String
    public var type: ChatEventType
    public var data: String
    public var timestamp: DateTime?

    public var timestampDate: Date? {
      timestamp?.decoded
    }

    init(type: ChatEventType, data: String, timestamp: DateTime? = nil) {
      id = UUID().uuidString
      self.type = type
      self.data = data
      self.timestamp = timestamp
    }
  }

  enum ChatEventType: String, Codable, CaseIterable {
    case message
    case attachment
    case event
    case ping
  }
}
