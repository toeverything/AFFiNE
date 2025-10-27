//
//  ChatListView.swift
//  Intelligents
//
//  Created by 秋星桥 on 7/2/25.
//

import Combine
import ListViewKit
import MarkdownView
import UIKit

class ChatListView: UIView {
  private(set) lazy var listView = ListView()
  private(set) lazy var dataSource = ListViewDiffableDataSource<ChatItemEntity>(listView: listView)

  var cancellables: Set<AnyCancellable> = []

  init() {
    super.init(frame: .zero)

    listView.topInset = 8
    listView.bottomInset = 64
    listView.adapter = self
    addSubview(listView)
    listView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    let dataSourceQueue = DispatchQueue(label: "com.affine.intelligents.chat.list.dataSource", qos: .userInteractive)

    Publishers.CombineLatest(
      IntelligentContext.shared.$currentSession
        .map { $0?.id ?? "default_session" }
        .removeDuplicates(),
      ChatManager.shared.$viewModels
    )
    .receive(on: dataSourceQueue)
    .map { sessionIdentifier, viewModels in
      .init(viewModels[sessionIdentifier]?.map(\.value) ?? [])
    }
    .sink { [weak self] viewModels in
      guard let self else { return }
      fill(viewModels: viewModels)
    }
    .store(in: &cancellables)

    Publishers.CombineLatest(
      IntelligentContext.shared.$currentSession
        .map { $0?.id ?? "default_session" }
        .removeDuplicates(),
      ChatManager.shared.scrollToBottomPublisher
    )
    .receive(on: dataSourceQueue)
    .filter { $0 == $1 }
    .map { _ in () }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] _ in
      guard let self else { return }
      scrollToBottom()
    }
    .store(in: &cancellables)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  deinit {
    cancellables.forEach { $0.cancel() }
    cancellables.removeAll()
  }

  func scrollToBottom() {
    if listView.contentSize.height <= listView.bounds.height {
      // If the content size is smaller than the bounds, no need to scroll.
      return
    }
    let contentOffset = CGPoint(
      x: 0,
      y: listView.contentSize.height - listView.bounds.height
    )
    listView.scroll(to: contentOffset)
  }
}
