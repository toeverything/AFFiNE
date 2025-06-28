//
//  ChatManager+InputModels.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

// MARK: - ChatManager Input Models Extension

extension ChatManager {
  // MARK: - Input Models

  struct AddContextFileInput: Codable, Equatable, Hashable {
    var contextId: String
    var blobId: String
  }

  struct RemoveContextFileInput: Codable, Equatable, Hashable {
    var contextId: String
    var fileId: String
  }

  struct AddContextDocInput: Codable, Equatable, Hashable {
    var contextId: String
    var docId: String
  }

  struct RemoveContextDocInput: Codable, Equatable, Hashable {
    var contextId: String
    var docId: String
  }

  struct AddContextCategoryInput: Codable, Equatable, Hashable {
    var contextId: String
    var docs: [String]
  }

  struct RemoveContextCategoryInput: Codable, Equatable, Hashable {
    var contextId: String
    var categoryId: String
  }
}
