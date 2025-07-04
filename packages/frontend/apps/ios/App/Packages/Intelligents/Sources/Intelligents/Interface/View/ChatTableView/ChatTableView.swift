import Combine
import OrderedCollections
import SnapKit
import Then
import UIKit

protocol ChatTableViewDelegate: AnyObject {
  func chatTableView(_ tableView: ChatTableView, didSelectRowAt indexPath: IndexPath)
}

class ChatTableView: UIView {
  // MARK: - UI Components

  lazy var tableView = UITableView().then {
    $0.backgroundColor = .clear
    $0.separatorStyle = .none
    $0.delegate = self
    $0.dataSource = self
    $0.keyboardDismissMode = .interactive
    $0.contentInsetAdjustmentBehavior = .never
    $0.tableFooterView = UIView(frame: .init(x: 0, y: 0, width: 100, height: 500))
  }

  lazy var emptyStateView = UIView().then {
    $0.isHidden = true
  }

  lazy var emptyStateLabel = UILabel().then {
    $0.text = "Start a conversation..."
    $0.font = .systemFont(ofSize: 18, weight: .medium)
    $0.textColor = .systemGray
    $0.textAlignment = .center
  }

  // MARK: - Properties

  weak var delegate: ChatTableViewDelegate?
  var sessionId: String? {
    didSet {
      if let sessionId {
        bindToSession(sessionId)
      }
    }
  }

  private var cancellables = Set<AnyCancellable>()

  var cellViewModels: OrderedDictionary<UUID, any ChatCellViewModel> = [:] {
    didSet {
      updateEmptyState()
      tableView.reloadData()

      if !cellViewModels.isEmpty {
        let indexPath = IndexPath(row: cellViewModels.count - 1, section: 0)
        tableView.scrollToRow(at: indexPath, at: .bottom, animated: true)
      }
    }
  }

  // MARK: - Initialization

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupUI()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupUI()
  }

  // MARK: - Setup

  private func setupUI() {
    // 注册所有 cell 类型
    ChatCellFactory.registerCells(for: tableView)

    addSubview(tableView)
    addSubview(emptyStateView)

    emptyStateView.addSubview(emptyStateLabel)

    tableView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    emptyStateView.snp.makeConstraints { make in
      make.center.equalTo(tableView)
      make.width.lessThanOrEqualTo(tableView).inset(32)
    }

    emptyStateLabel.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }
  }

  // MARK: - Public Methods

  func scrollToBottom(animated: Bool = true) {
    guard !cellViewModels.isEmpty else { return }
    let indexPath = IndexPath(row: cellViewModels.count - 1, section: 0)
    tableView.scrollToRow(at: indexPath, at: .bottom, animated: animated)
  }

  // MARK: - Private Methods

  private func bindToSession(_ sessionId: String) {
    cancellables.removeAll()

    ChatManager.shared.$viewModels
      .map { $0[sessionId] ?? [:] }
      .receive(on: DispatchQueue.main)
      .sink { [weak self] viewModels in
        self?.cellViewModels = viewModels
      }
      .store(in: &cancellables)
  }

  private func updateEmptyState() {
    emptyStateView.isHidden = !cellViewModels.isEmpty
    tableView.isHidden = cellViewModels.isEmpty
  }
}

// MARK: - UITableViewDataSource

extension ChatTableView: UITableViewDataSource {
  func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
    cellViewModels.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let viewModel = cellViewModels.elements[indexPath.row].value
    return ChatCellFactory.dequeueCell(for: tableView, at: indexPath, with: viewModel)
  }
}

// MARK: - UITableViewDelegate

extension ChatTableView: UITableViewDelegate {
  func tableView(_: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
    let viewModel = cellViewModels.elements[indexPath.row].value
    return ChatCellFactory.estimatedHeight(for: viewModel)
  }

  func tableView(_: UITableView, estimatedHeightForRowAt indexPath: IndexPath) -> CGFloat {
    let viewModel = cellViewModels.elements[indexPath.row].value
    return ChatCellFactory.estimatedHeight(for: viewModel)
  }

  func tableView(_: UITableView, didSelectRowAt indexPath: IndexPath) {
    delegate?.chatTableView(self, didSelectRowAt: indexPath)
  }
}
