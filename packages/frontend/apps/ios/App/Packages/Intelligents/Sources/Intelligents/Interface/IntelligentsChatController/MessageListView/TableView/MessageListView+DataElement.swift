//
//  MessageListView+DataElement.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Combine
import Foundation
import UIKit

extension MessageListView {
  struct Element: Identifiable {
    let id: AnyHashable // equals to message id if applicable

    enum Cell: String, CaseIterable {
      case base
      case hint
      case user
      case assistant
      case spacer
    }

    let cell: Cell
    let viewModel: any ViewModel

    typealias UserObject = any(Identifiable & Hashable)
    let object: UserObject?

    init(id: AnyHashable, cell: Cell, viewModel: any ViewModel, object: UserObject?) {
      assert(cell != .base)
      self.id = id
      self.cell = cell
      self.viewModel = viewModel
      self.object = object
    }
  }
}

extension MessageListView.Element.Cell {
  var cellClass: MessageListView.BaseCell.Type {
    switch self {
    case .base:
      MessageListView.BaseCell.self
    case .hint:
      MessageListView.HintCell.self
    case .user:
      MessageListView.UserCell.self
    case .assistant:
      MessageListView.AssistantCell.self
    case .spacer:
      MessageListView.SpacerCell.self
    }
  }
}

extension MessageListView.Element {
  protocol ViewModel {
    func contentIdentifier(hasher: inout Hasher)
  }
}
