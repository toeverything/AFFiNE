//
//  DocumentAttachment.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import Foundation

public struct DocumentAttachment: Identifiable, Equatable, Hashable, Codable {
  public var id: UUID = .init()
  public var title: String = ""
  public var workspaceID: String = ""
  public var documentID: String = ""
  public var updatedAt: Date?

  public init(id: UUID = .init(), title: String = "", workspaceID: String = "", documentID: String = "", updatedAt: Date? = nil) {
    self.id = id
    self.title = title
    self.workspaceID = workspaceID
    self.documentID = documentID
    self.updatedAt = updatedAt
  }
}
