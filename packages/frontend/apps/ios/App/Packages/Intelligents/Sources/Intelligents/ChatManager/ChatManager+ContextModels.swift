//
//  ChatManager+ContextModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

// MARK: - ChatManager Context Models Extension

extension ChatManager {
  // MARK: - Context Models

  struct ContextReference: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var fileId: String?
    var docId: String?
    var chunk: Int
    var content: String
    var distance: Double
    var highlightedContent: String?

    init(fileId: String? = nil, docId: String? = nil, chunk: Int, content: String, distance: Double, highlightedContent: String? = nil) {
      id = UUID().uuidString
      self.fileId = fileId
      self.docId = docId
      self.chunk = chunk
      self.content = content
      self.distance = distance
      self.highlightedContent = highlightedContent
    }
  }

  struct CopilotContext: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var sessionId: String
    var workspaceId: String
    var files: [ContextFile]
    var docs: [ContextDoc]
    var categories: [ContextCategory]

    init(id: String, sessionId: String, workspaceId: String, files: [ContextFile] = [], docs: [ContextDoc] = [], categories: [ContextCategory] = []) {
      self.id = id
      self.sessionId = sessionId
      self.workspaceId = workspaceId
      self.files = files
      self.docs = docs
      self.categories = categories
    }
  }

  struct ContextFile: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var contextId: String
    var blobId: String
    var fileName: String?
    var fileSize: Int?
    var mimeType: String?
    var embeddingStatus: ContextEmbedStatus?
    var createdAt: DateTime?

    var createdDate: Date? {
      createdAt?.decoded
    }
  }

  struct ContextDoc: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var contextId: String
    var docId: String
    var title: String?
    var embeddingStatus: ContextEmbedStatus?
    var createdAt: DateTime?

    var createdDate: Date? {
      createdAt?.decoded
    }
  }

  struct ContextCategory: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var contextId: String
    var type: ContextCategoryType
    var docs: [String]
    var name: String?
    var createdAt: DateTime?

    var createdDate: Date? {
      createdAt?.decoded
    }
  }

  enum ContextEmbedStatus: String, Codable, CaseIterable {
    case pending = "Pending"
    case failed = "Failed"
    case completed = "Completed"
  }

  enum ContextCategoryType: String, Codable, CaseIterable {
    case tag = "TAG"
    case collection = "COLLECTION"
  }

  struct MatchContextResult: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var fileId: String?
    var docId: String?
    var chunk: Int
    var content: String
    var distance: Double
    var highlightedContent: String?

    init(fileId: String? = nil, docId: String? = nil, chunk: Int, content: String, distance: Double, highlightedContent: String? = nil) {
      id = UUID().uuidString
      self.fileId = fileId
      self.docId = docId
      self.chunk = chunk
      self.content = content
      self.distance = distance
      self.highlightedContent = highlightedContent
    }
  }
}
