//
//  FileAttachment.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import Foundation

public struct FileAttachment: Identifiable, Equatable, Hashable, Codable {
  public var id: UUID = .init()
  public var data: Data?
  public var url: URL
  public var name: String
  public var size: Int64

  public init(
    data: Data? = nil,
    url: URL,
    name: String,
    size: Int64 = 0
  ) {
    self.data = data
    self.url = url
    self.name = name
    self.size = size
  }
}
