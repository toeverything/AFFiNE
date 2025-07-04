//
//  ChatCellFactory.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import UIKit

class ChatCellFactory {
  // MARK: - Cell Registration

  static func registerCells(for tableView: UITableView) {
    tableView.register(UserMessageCell.self, forCellReuseIdentifier: CellType.userMessage.rawValue)
    tableView.register(AssistantMessageCell.self, forCellReuseIdentifier: CellType.assistantMessage.rawValue)
    tableView.register(SystemMessageCell.self, forCellReuseIdentifier: CellType.systemMessage.rawValue)
    tableView.register(LoadingCell.self, forCellReuseIdentifier: CellType.loading.rawValue)
    tableView.register(ErrorCell.self, forCellReuseIdentifier: CellType.error.rawValue)
  }

  // MARK: - Cell Creation

  static func dequeueCell(
    for tableView: UITableView,
    at indexPath: IndexPath,
    with viewModel: any ChatCellViewModel
  ) -> ChatBaseCell {
    let identifier = viewModel.cellType.rawValue

    guard let cell = tableView.dequeueReusableCell(
      withIdentifier: identifier,
      for: indexPath
    ) as? ChatBaseCell else {
      // 如果无法获取指定类型的cell，使用系统消息cell作为fallback
      let fallbackCell = tableView.dequeueReusableCell(
        withIdentifier: CellType.systemMessage.rawValue,
        for: indexPath
      ) as! SystemMessageCell

      // 创建一个fallback的ViewModel
      let fallbackViewModel = SystemMessageCellViewModel(
        id: viewModel.id,
        content: "不支持的消息类型: \\(viewModel.cellType.rawValue)",
        timestamp: Date()
      )
      fallbackCell.configure(with: fallbackViewModel)
      return fallbackCell
    }

    cell.configure(with: viewModel)
    return cell
  }

  // MARK: - Height Estimation

  static func estimatedHeight(for viewModel: any ChatCellViewModel) -> CGFloat {
    switch viewModel.cellType {
    case .userMessage,
         .assistantMessage:
      80
    case .systemMessage:
      60
    case .loading:
      100
    case .error:
      120
    }
  }
}
