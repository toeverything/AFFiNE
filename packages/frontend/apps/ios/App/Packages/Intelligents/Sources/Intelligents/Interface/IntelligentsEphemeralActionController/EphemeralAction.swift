//
//  EphemeralAction.swift
//  Intelligents
//
//  Created by 秋星桥 on 2025/1/8.
//

import Foundation

public extension IntelligentsEphemeralActionController {
  enum EphemeralAction {
    public enum Language: String, CaseIterable {
      case langEnglish = "English"
      case langSpanish = "Spanish"
      case langGerman = "German"
      case langFrench = "French"
      case langItalian = "Italian"
      case langSimplifiedChinese = "Simplified Chinese"
      case langTraditionalChinese = "Traditional Chinese"
      case langJapanese = "Japanese"
      case langRussian = "Russian"
      case langKorean = "Korean"
    }

    case translate(to: Language)
    case summarize
  }
}

extension IntelligentsEphemeralActionController.EphemeralAction {
  var title: String {
    switch self {
    case let .translate(to):
      String(format: NSLocalizedString("Translate to %@", comment: ""), to.rawValue)
    case .summarize:
      NSLocalizedString("Summarize", comment: "")
    }
  }

  var prompt: Prompt {
    switch self {
    case .translate:
      .general_Translate_to
    case .summarize:
      .general_Summary
    }
  }
}
