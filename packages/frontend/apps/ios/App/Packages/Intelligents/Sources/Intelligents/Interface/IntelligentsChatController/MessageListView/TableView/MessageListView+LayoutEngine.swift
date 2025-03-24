//
//  MessageListView+LayoutEngine.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Foundation

extension MessageListView {
  class TableLayoutEngine {
    private let lock = NSLock()
    struct LayoutCacheBox {
      var cache: LayoutCache
      var contentIdentifier: Int
    }

    private var layoutCache: [Element.ID: LayoutCacheBox] = [:]
    private(set) var contentWidth: CGFloat = .zero
    var layoutSession: UUID = .init()

    func setContentWidth(_ width: CGFloat) {
      accessLayoutCache { _ in
        contentWidth = width
        layoutSession = .init()
      }
    }

    func createSession() -> UUID {
      let session = UUID()
      layoutSession = session
      return session
    }

    @discardableResult
    func accessLayoutCache<T>(_ block: (inout [Element.ID: LayoutCacheBox]) -> T) -> T {
      lock.lock()
      defer { lock.unlock() }
      return block(&layoutCache)
    }

    func contentIdentifier(forElement dataElement: Element) -> Int? {
      accessLayoutCache { pool in
        guard let box = pool[dataElement.id] else { return nil }
        return box.contentIdentifier
      }
    }
  }

  func viewCallingUpdateLayoutEngineWidth() {
    guard layoutEngine.contentWidth != tableView.bounds.width else { return }
    layoutEngine.setContentWidth(tableView.bounds.width)
    reconfigure(enforceReload: false)
    NSObject.cancelPreviousPerformRequests(
      withTarget: self,
      selector: #selector(resolveAllLayoutInBackground),
      object: nil
    )
    perform(#selector(resolveAllLayoutInBackground), with: nil, afterDelay: 0.1)
  }

  @objc private func resolveAllLayoutInBackground() {
    let items = Array(elements.values)
    let date = Date()
    DispatchQueue.global().async {
      let session = self.layoutEngine.createSession()
      for element in items {
        guard self.layoutEngine.layoutSession == session else { continue }
        self.layoutEngine.resolveLayoutNow(element)
      }
      DispatchQueue.main.async {
        self.reconfigure(enforceReload: true)
        print("[*] layout engine updated \(items.count) items in \(Date().timeIntervalSince(date)) seconds")
      }
    }
  }
}

extension MessageListView.TableLayoutEngine {
  protocol LayoutableCell: AnyObject {
    static func resolveLayout(
      dataElement: MessageListView.Element,
      contentWidth: CGFloat
    ) -> LayoutCache
  }

  protocol LayoutCache: AnyObject {
    var width: CGFloat { get }
    var height: CGFloat { get }
  }

  class ZeroLayoutCache: LayoutCache {
    var width: CGFloat = 0
    var height: CGFloat = 0
  }
}

extension MessageListView.TableLayoutEngine {
  @discardableResult
  func resolveLayoutNow(_ element: MessageListView.Element) -> LayoutCache {
    var hasher = Hasher()
    element.viewModel.contentIdentifier(hasher: &hasher)
    let contentIdentifier = hasher.finalize()

    if let cacheBox = accessLayoutCache({ $0[element.id] }) {
      if cacheBox.cache.width == contentWidth,
         cacheBox.contentIdentifier == contentIdentifier
      { return cacheBox.cache }
    }

    let target = element.cell.cellClass.self
    let cache = target.resolveLayout(dataElement: element, contentWidth: contentWidth)
    let cacheBox = LayoutCacheBox(cache: cache, contentIdentifier: contentIdentifier)
    accessLayoutCache { $0[element.id] = cacheBox }
    return cache
  }

  func requestLayoutCacheFromCell(
    forElement dataElement: MessageListView.Element,
    atWidth width: CGFloat
  ) -> LayoutCache {
    let cache = accessLayoutCache { pool -> LayoutCache? in
      guard let box = pool[dataElement.id] else { return nil }
      guard box.contentIdentifier == dataElement.object?.hashValue else { return nil }
      guard box.cache.width == contentWidth else { return nil }
      guard box.cache.width == width else { return nil }
      return box.cache
    }
    if let cache { return cache }
    return resolveLayoutNow(dataElement)
  }
}

extension MessageListView.TableLayoutEngine {
  func height(forElement dataElement: MessageListView.Element) -> CGFloat? {
    accessLayoutCache { pool in
      guard let box = pool[dataElement.id] else { return nil }
      guard box.contentIdentifier == dataElement.object?.hashValue else { return nil }
      guard box.cache.width == contentWidth else { return nil }
      return box.cache.height
    }
  }
}
