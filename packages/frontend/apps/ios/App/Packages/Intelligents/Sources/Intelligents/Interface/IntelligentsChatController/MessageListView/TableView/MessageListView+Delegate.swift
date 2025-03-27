//
//  MessageListView+Delegate.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/6.
//

import UIKit

extension MessageListView: UITableViewDelegate, UITableViewDataSource {
  func item(forIndexPath indexPath: IndexPath) -> Element? {
    guard indexPath.row < elements.count else {
      return nil
    }
    guard indexPath.row >= 0 else {
      return nil
    }
    return elements.values[indexPath.row]
  }

  func numberOfSections(in _: UITableView) -> Int {
    1
  }

  func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
    elements.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    guard let item = item(forIndexPath: indexPath) else {
      assertionFailure()
      return UITableViewCell()
    }
    let cell = tableView.dequeueReusableCell(withIdentifier: item.cell.rawValue, for: indexPath)
    if let cell = cell as? BaseCell {
      cell.layoutEngine = layoutEngine
      cell.registerViewModel(element: item)
    }
    cell.backgroundColor = .clear
    return cell
  }

  func tableView(_: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
    guard let item = item(forIndexPath: indexPath) else {
      return 0
    }
    if let height = layoutEngine.height(forElement: item) {
      heightKeeper[item.id] = height
      return height
    }
    let ret = layoutEngine.resolveLayoutNow(item).height
    heightKeeper[item.id] = ret
    return ret
  }

  func tableView(_: UITableView, estimatedHeightForRowAt indexPath: IndexPath) -> CGFloat {
    guard let item = item(forIndexPath: indexPath) else {
      return 0
    }
    if let height = layoutEngine.height(forElement: item) {
      return height
    }
    if let height = heightKeeper[item.id] {
      return height
    }
    return UITableView.automaticDimension
  }
}
