//
//  MessageListView+Update.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Combine
import Foundation
import OrderedCollections
import UIKit

extension MessageListView {
  func setupPublishers(dataPublisher: AnyPublisher<[Element], Never>) {
    // process input from data source where we transform those to view model
    let publisher = dataPublisher
      .map { input -> [Element] in input + [Element(
        id: "spacer",
        cell: .spacer,
        viewModel: MessageListView.SpacerCell.ViewModel(height: 32),
        object: nil
      )] }
      .map { output in
        OrderedDictionary<Element.ID, Element>(
          uniqueKeysWithValues: output.map { ($0.id, $0) }
        )
      }
      .eraseToAnyPublisher()

    // after so, limit the refresh rate so we can handle them better
    let updateQueue = DispatchQueue(label: "flowdown.message-list-update-queue", qos: .userInteractive)
    let inQueuePublisher = publisher
      .throttle(for: .seconds(1 / 5), scheduler: updateQueue, latest: true)
      .eraseToAnyPublisher()

    // finally before sending to display, call layout engine to process those items
    inQueuePublisher
      .sink { [weak self] output in self?.prepare(forNewElements: output) }
      .store(in: &cancellables)
  }

  func prepare(forNewElements elements: Elements) {
    print("[*] received \(elements.count) for update at \(Date())")
    elementUpdateProcessLock.lock()
    distributedPendingUpdateElements = elements
    elementUpdateProcessLock.unlock()
    performSelector(onMainThread: #selector(elementsUpdateExecute), with: nil, waitUntilDone: false)
  }

  private func pickupElementsPair() -> (oldValue: Elements, newValue: Elements)? {
    #if DEBUG // just make sure assert is not called in release mode
      assert(!elementUpdateProcessLock.try(), "Should not call this method without lock")
    #endif
    guard let distributedPendingUpdateElements else { return nil }

    let oldValue = elements
    elements = distributedPendingUpdateElements
    self.distributedPendingUpdateElements = nil
    print("[*] pikup is sending \(elements.count) for update at \(Date())")
    return (oldValue, distributedPendingUpdateElements)
  }

  @objc private func elementsUpdateExecute() {
    assert(Thread.isMainThread)
    elementUpdateProcessLock.lock()
    defer { elementUpdateProcessLock.unlock() }
    let pickup = pickupElementsPair()
    guard let (oldValue, newValue) = pickup else { return }
    guard window != nil else { return }
    for value in heightKeeper.keys where !newValue.keys.contains(value) {
      heightKeeper.removeValue(forKey: value)
    }

    let shouldRealodTableView = newValue.count != oldValue.count
    let contentOffset = tableView.contentOffset
    UIView.performWithoutAnimation {
      self.reconfigure(enforceReload: shouldRealodTableView)
      self.tableView.layoutIfNeeded()
    }
    tableView.contentOffset = contentOffset
  }

  func reconfigure(enforceReload: Bool) {
    if enforceReload || tableView(tableView, numberOfRowsInSection: 0) != elements.count {
      tableView.reloadData()
      return
    }
    var requiresReload = [IndexPath]()
    for indexPath in tableView.indexPathsForVisibleRows ?? [] {
      guard let item = item(forIndexPath: indexPath) else { continue }
      guard let cell = tableView.cellForRow(at: indexPath) as? BaseCell else { continue }
      guard type(of: cell) == item.cell.cellClass else {
        requiresReload.append(indexPath)
        continue
      }
      layoutEngine.resolveLayoutNow(item)
      cell.registerViewModel(element: item)
    }
    tableView.beginUpdates()
    tableView.reloadRows(at: requiresReload, with: .none)
    tableView.endUpdates()
  }
}

extension MessageListView {
  func scrollToBottom(useTableViewAnimation: Bool = false) {
    guard elements.count > 0 else { return }
    guard tableView.contentSize.height > tableView.frame.height else { return }
    let targetIndexPath = IndexPath(row: elements.count - 1, section: 0)
    let cellRect = tableView.rectForRow(at: targetIndexPath)
    if tableView.contentOffset.y + tableView.frame.height >= cellRect.origin.y + cellRect.height { return }
    UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 1.0, initialSpringVelocity: 0.8) {
      self.tableView.scrollToRow(
        at: targetIndexPath,
        at: .bottom,
        animated: useTableViewAnimation
      )
      self.tableView.layoutIfNeeded()
    }
    NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(finishAutomaticScroll), object: nil)
    isAutomaticScrollAnimating = true
    perform(#selector(finishAutomaticScroll), with: nil, afterDelay: 0.5)
  }

  func scrollLastCellToTop(useTableViewAnimation: Bool = false) {
    guard elements.count > 1 else { return }
    guard tableView.contentSize.height > tableView.frame.height else { return }
    UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 1.0, initialSpringVelocity: 0.8) {
      self.tableView.scrollToRow(
        at: IndexPath(row: self.elements.count - 1, section: 0),
        at: .top,
        animated: useTableViewAnimation
      )
    }
    NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(finishAutomaticScroll), object: nil)
    isAutomaticScrollAnimating = true
    perform(#selector(finishAutomaticScroll), with: nil, afterDelay: 0.5)
  }

  @objc private func finishAutomaticScroll() {
    isAutomaticScrollAnimating = false
  }
}
