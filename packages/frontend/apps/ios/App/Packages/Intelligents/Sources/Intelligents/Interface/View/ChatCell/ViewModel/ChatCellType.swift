//
//  ChatCellType.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

public enum ChatCellType: String, CaseIterable {
  case userMessage
  case userAttachmentsHint
  case assistantMessage
  case systemMessage
  case loading
  case error
}
