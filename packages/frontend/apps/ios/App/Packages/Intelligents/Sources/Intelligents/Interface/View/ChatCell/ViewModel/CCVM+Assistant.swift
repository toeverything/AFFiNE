//
//  CCVM+Assistant.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation
import MarkdownParser
import MarkdownView

struct AssistantMessageCellViewModel: ChatCellViewModel {
  static func == (lhs: AssistantMessageCellViewModel, rhs: AssistantMessageCellViewModel) -> Bool {
    lhs.hashValue == rhs.hashValue
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(cellType)
    hasher.combine(id)
    hasher.combine(content)
    hasher.combine(timestamp)
    hasher.combine(isStreaming)
    hasher.combine(model)
    hasher.combine(tokens)
    hasher.combine(canRetry)
    hasher.combine(citations)
    hasher.combine(actions)
  }

  var cellType: ChatCellType = .assistantMessage
  var id: UUID
  var content: String
  var timestamp: Date
  var isStreaming: Bool = false
  var model: String?
  var tokens: Int?
  var canRetry: Bool = false
  var citations: [CitationViewModel]?
  var actions: [MessageActionViewModel]?

  var documentBlocks: [MarkdownBlockNode]
  var documentRenderedContent: RenderContext

  init(
    id: UUID,
    content: String,
    timestamp: Date,
    isStreaming: Bool = false,
    model: String? = nil,
    tokens: Int? = nil,
    canRetry: Bool = false,
    citations: [CitationViewModel]? = nil,
    actions: [MessageActionViewModel]? = nil
  ) {
    // time expensive rendering should not happen here
    assert(!Thread.isMainThread || content.isEmpty)

    self.id = id
    self.content = content
    self.timestamp = timestamp
    self.isStreaming = isStreaming
    self.model = model
    self.tokens = tokens
    self.canRetry = canRetry
    self.citations = citations
    self.actions = actions

    let parser = MarkdownParser()
    let parserResult = parser.parse(content)
    documentBlocks = parserResult.document
    var renderedContexts: [String: RenderedItem] = [:]
    for (key, value) in parserResult.mathContext {
      let image = MathRenderer.renderToImage(
        latex: value,
        fontSize: MarkdownTheme.default.fonts.body.pointSize,
        textColor: MarkdownTheme.default.colors.body
      )?.withRenderingMode(.alwaysTemplate)
      let renderedContext = RenderedItem(
        image: image,
        text: value
      )
      renderedContexts["math://\(key)"] = renderedContext
    }
    documentRenderedContent = renderedContexts
  }
}

struct CitationViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var title: String
  var url: String?
  var snippet: String?
}

struct MessageActionViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var title: String
  var actionType: ActionType
  var data: [String: String]?

  enum ActionType: String, Codable {
    case copy
    case regenerate
    case like
    case dislike
    case share
    case edit
  }
}
