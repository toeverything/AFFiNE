//
//  MessageListView.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Combine
import OrderedCollections
import UIKit

class MessageListView: UIView {
  typealias ElementPublisher = AnyPublisher<[Element], Never>
  typealias Elements = OrderedDictionary<Element.ID, Element>
  var elements: Elements = .init()

  var cancellables: Set<AnyCancellable> = []

  let tableView: UITableView = .init(frame: .zero, style: .plain)

  let layoutEngine = TableLayoutEngine()
  var heightKeeper: [Element.ID: CGFloat] = [:]
  let elementUpdateProcessLock = NSLock()
  var distributedPendingUpdateElements: Elements? = nil
  var isAutomaticScrollAnimating: Bool = false

  let footerView = UIView(frame: .init(x: 0, y: 0, width: 0, height: 500))

  init(dataPublisher: AnyPublisher<[Element], Never>) {
    super.init(frame: .zero)

    tableView.delegate = self
    tableView.dataSource = self
    tableView.allowsSelection = false
    tableView.allowsMultipleSelection = false
    tableView.allowsFocus = false
    tableView.selectionFollowsFocus = true
    tableView.separatorColor = .clear
    tableView.backgroundColor = .clear
    for cellIdentifier in Element.Cell.allCases {
      tableView.register(cellIdentifier.cellClass, forCellReuseIdentifier: cellIdentifier.rawValue)
    }
    addSubview(tableView)

    tableView.tableFooterView = footerView
    tableView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      tableView.topAnchor.constraint(equalTo: topAnchor),
      tableView.bottomAnchor.constraint(equalTo: bottomAnchor),
      tableView.leadingAnchor.constraint(equalTo: leadingAnchor),
      tableView.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])

    setupPublishers(dataPublisher: dataPublisher)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  deinit {
    cancellables.forEach { $0.cancel() }
    cancellables.removeAll()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    viewCallingUpdateLayoutEngineWidth()
  }
}
