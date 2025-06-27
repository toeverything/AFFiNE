//
//  ChatManager+ContextModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Foundation

// MARK: - ChatManager Context Models Extension

// TODO: Temporarily disabled context models

/*
 public extension ChatManager {
   // MARK: - Context Models

   struct ContextReference: Codable, Identifiable, Equatable, Hashable {
     public var id: String
     public var fileId: String?
     public var docId: String?
     public var title: String?
     public var type: String?
     public var chunk: Int
     public var content: String
     public var distance: Double
     public var highlightedContent: String?

     public init(fileId: String? = nil, docId: String? = nil, title: String? = nil, type: String? = nil, chunk: Int, content: String, distance: Double, highlightedContent: String? = nil) {
       id = UUID().uuidString
       self.fileId = fileId
       self.docId = docId
       self.title = title
       self.type = type
       self.chunk = chunk
       self.content = content
       self.distance = distance
       self.highlightedContent = highlightedContent
     }
   }

   struct CopilotContext: Codable, Identifiable, Equatable, Hashable {
     public var id: String
     public var sessionId: String
     public var workspaceId: String
     public var files: [ContextFile]
     public var docs: [ContextDoc]
     public var categories: [ContextCategory]

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
     public var id: String
     public var contextId: String
     public var blobId: String
     public var fileName: String?
     public var fileSize: Int?
     public var mimeType: String?
     public var embeddingStatus: ContextEmbedStatus?
     public var createdAt: DateTime?

     var createdDate: Date? {
       createdAt?.decoded
     }
   }

   struct ContextDoc: Codable, Identifiable, Equatable, Hashable {
     public var id: String
     public var contextId: String
     public var docId: String
     public var title: String?
     public var embeddingStatus: ContextEmbedStatus?
     public var createdAt: DateTime?

     public var createdDate: Date? {
       createdAt?.decoded
     }
   }

   struct ContextCategory: Codable, Identifiable, Equatable, Hashable {
     public var id: String
     public var contextId: String
     public var type: ContextCategoryType
     public var docs: [String]
     public var name: String?
     public var createdAt: DateTime?

     public var createdDate: Date? {
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
     public var id: String
     public var fileId: String?
     public var docId: String?
     public var chunk: Int
     public var content: String
     public var distance: Double
     public var highlightedContent: String?

     public init(fileId: String? = nil, docId: String? = nil, chunk: Int, content: String, distance: Double, highlightedContent: String? = nil) {
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
 */
