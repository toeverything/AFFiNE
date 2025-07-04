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
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }
}
