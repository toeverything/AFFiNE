//
//  CellType.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

enum CellType: String, Codable, CaseIterable {
  case userMessage
  case assistantMessage
  case systemMessage
  case attachment
  case contextReference
  case workflowStatus
  case transcription
  case loading
  case error
}
