//
//  ChidoriMenu+Gesture.swift
//  ChidoriMenu
//
//  Created by 秋星桥 on 1/19/25.
//

import UIKit

extension ChidoriMenu {
  @objc func panned(panGestureRecognizer: UIPanGestureRecognizer) {
    let offsetInTableView = panGestureRecognizer.location(in: tableView)
    guard let indexPath = tableView.indexPathForRow(at: offsetInTableView) else {
      // If we pan outside the table and there's a cell selected, unselect it
      for indexPath in tableView.indexPathsForSelectedRows ?? [] {
        tableView.deselectRow(at: indexPath, animated: false)
      }
      return
    }
    if panGestureRecognizer.state == .ended {
      // Treat is as a tap
      for indexPath in tableView.indexPathsForSelectedRows ?? [] {
        tableView.deselectRow(at: indexPath, animated: false)
      }
      executeAction(indexPath)
    } else {
      // This API always confuses me, it does not *select* the cell in a way that would call `didSelectRowAtIndexPath`, this just visually highlights it!
      tableView.selectRow(at: indexPath, animated: false, scrollPosition: .none)
    }
  }
}
