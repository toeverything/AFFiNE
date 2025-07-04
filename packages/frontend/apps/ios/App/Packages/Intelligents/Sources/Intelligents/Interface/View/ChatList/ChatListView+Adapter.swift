//
//  ChatListView+Adapter.swift
//  Intelligents
//
//  Created by 秋星桥 on 7/2/25.
//

import ListViewKit
import UIKit

extension ChatListView: ListViewAdapter {
  func fill(viewModels: [any ChatCellViewModel]) {
    assert(!Thread.isMainThread)
    let items = viewModels.map { ChatItemEntity(id: $0.id, object: $0) }
    preprocessItems(items)
    DispatchQueue.main.asyncAndWait { [self] in
      dataSource.applySnapshot(using: items, animatingDifferences: true)
    }
  }

  private func preprocessItems(_: [ChatItemEntity]) {
    // reserved for future use
  }

  func listView(_: ListViewKit.ListView, rowKindFor item: ItemType, at _: Int) -> RowKind {
    let item = item as! ChatItemEntity
    return item.object.cellType
  }

  func listViewMakeRow(for kind: RowKind) -> ListViewKit.ListRowView {
    switch kind as! ChatCellType {
    case .userMessage: UserMessageCell()
    case .userAttachmentsHint: UserHintCell()
    case .assistantMessage: AssistantMessageCell()
    case .systemMessage: SystemMessageCell()
    case .loading: LoadingCell()
    case .error: ErrorCell()
    }
  }

  func listView(_ list: ListViewKit.ListView, heightFor item: ItemType, at _: Int) -> CGFloat {
    let item = item as! ChatItemEntity
    return switch item.object.cellType {
    case .userMessage: UserMessageCell.heightForCell(for: item.object, width: list.bounds.width)
    case .userAttachmentsHint: UserHintCell.heightForCell(for: item.object, width: list.bounds.width)
    case .assistantMessage: AssistantMessageCell.heightForCell(for: item.object, width: list.bounds.width)
    case .systemMessage: SystemMessageCell.heightForCell(for: item.object, width: list.bounds.width)
    case .loading: LoadingCell.heightForCell(for: item.object, width: list.bounds.width)
    case .error: ErrorCell.heightForCell(for: item.object, width: list.bounds.width)
    }
  }

  func listView(_: ListViewKit.ListView, configureRowView rowView: ListViewKit.ListRowView, for item: ItemType, at _: Int) {
    let base = rowView as! ChatBaseCell
    let item = item as! ChatItemEntity
    base.configure(with: item.object)
  }
}
