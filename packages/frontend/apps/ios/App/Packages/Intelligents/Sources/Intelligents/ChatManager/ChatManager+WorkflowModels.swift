//
//  ChatManager+WorkflowModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

// MARK: - ChatManager Workflow Models Extension

extension ChatManager {
  // MARK: - Workflow Models

  struct WorkflowEventData: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var status: String
    var type: String
    var progress: Double?
    var message: String?

    init(status: String, type: String, progress: Double? = nil, message: String? = nil) {
      id = UUID().uuidString
      self.status = status
      self.type = type
      self.progress = progress
      self.message = message
    }
  }

  struct WorkspaceEmbeddingStatus: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var workspaceId: String
    var total: Int
    var embedded: Int

    var progress: Double {
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
    var id: String
    var type: ChatEventType
    var data: String
    var timestamp: DateTime?

    var timestampDate: Date? {
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
