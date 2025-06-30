//
//  CellType.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

public enum CellType: String, Codable, CaseIterable {
  case userMessage
  case assistantMessage
  case systemMessage
  case loading
  case error
}
