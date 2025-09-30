//
//  PromptName.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import Foundation

public enum PromptName: String, Codable {
  case summary = "Summary"
  case summaryAsTitle = "Summary as title"
  case explainThis = "Explain this"
  case writeAnArticleAboutThis = "Write an article about this"
  case writeATwitterAboutThis = "Write a twitter about this"
  case writeAPoemAboutThis = "Write a poem about this"
  case writeABlogPostAboutThis = "Write a blog post about this"
  case writeOutline = "Write outline"
  case changeToneTo = "Change tone to"
  case improveWritingForIt = "Improve writing for it"
  case improveGrammarForIt = "Improve grammar for it"
  case fixSpellingForIt = "Fix spelling for it"
  case createHeadings = "Create headings"
  case makeItLonger = "Make it longer"
  case makeItShorter = "Make it shorter"
  case continueWriting = "Continue writing"
  case chatWithAffineAI = "Chat With AFFiNE AI"
}
