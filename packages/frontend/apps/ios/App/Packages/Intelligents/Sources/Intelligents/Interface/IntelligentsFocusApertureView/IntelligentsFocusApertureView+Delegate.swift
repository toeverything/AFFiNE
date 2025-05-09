//
//  IntelligentsFocusApertureView+Delegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/21.
//

import Foundation

public enum IntelligentsFocusApertureViewActionType: String {
  case translateTo
  case summary
  case chatWithAI
  case dismiss
}

public protocol IntelligentsFocusApertureViewDelegate: AnyObject {
  func focusApertureRequestAction(
    from: IntelligentsFocusApertureView,
    actionType: IntelligentsFocusApertureViewActionType
  )
}
