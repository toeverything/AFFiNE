import Combine
import SnapKit
import Then
import UIKit

class MainViewController: UIViewController {
  // MARK: - UI Components

  lazy var headerView = MainHeaderView().then {
    $0.delegate = self
  }

  lazy var tableView = UITableView().then {
    $0.backgroundColor = .clear
    $0.separatorStyle = .none
    $0.delegate = self
    $0.dataSource = self
    $0.register(ChatCell.self, forCellReuseIdentifier: "ChatCell")
    $0.keyboardDismissMode = .interactive
    $0.contentInsetAdjustmentBehavior = .never
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

  lazy var inputBox = InputBox().then {
    $0.delegate = self
  }

  lazy var documentPickerHideDetector = UIView().then {
    $0.isUserInteractionEnabled = true
    $0.isHidden = true
    $0.addGestureRecognizer(
      UITapGestureRecognizer(target: self, action: #selector(hideDocumentPicker))
    )
  }

  lazy var documentPickerView = DocumentPickerView().then {
    $0.delegate = self
  }

  // MARK: - Properties

  private var messages: [ChatMessage] = []
  private var cancellables = Set<AnyCancellable>()
  private let intelligentContext = IntelligentContext.shared
  private let chatManager = ChatManager.shared
  var terminateEditGesture: UITapGestureRecognizer!

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .affineLayerBackgroundPrimary

    setupUI()
    setupBindings()

    view.isUserInteractionEnabled = true
    terminateEditGesture = UITapGestureRecognizer(target: self, action: #selector(terminateEditing))
    view.addGestureRecognizer(terminateEditGesture)
  }

  // MARK: - Setup

  private func setupUI() {
    view.addSubview(headerView)
    view.addSubview(tableView)
    view.addSubview(emptyStateView)
    view.addSubview(inputBox)
    view.addSubview(documentPickerHideDetector)
    view.addSubview(documentPickerView)

    emptyStateView.addSubview(emptyStateLabel)

    headerView.snp.makeConstraints { make in
      make.top.equalTo(view.safeAreaLayoutGuide)
      make.leading.trailing.equalToSuperview()
    }

    tableView.snp.makeConstraints { make in
      make.top.equalTo(headerView.snp.bottom)
      make.leading.trailing.equalToSuperview()
      make.bottom.equalTo(inputBox.snp.top)
    }

    emptyStateView.snp.makeConstraints { make in
      make.center.equalTo(tableView)
      make.width.lessThanOrEqualTo(tableView).inset(32)
    }

    emptyStateLabel.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    inputBox.snp.makeConstraints { make in
      make.leading.trailing.equalToSuperview()
      make.bottom.equalTo(view.keyboardLayoutGuide.snp.top)
    }

    documentPickerHideDetector.snp.makeConstraints { make in
      make.left.top.right.equalToSuperview()
      make.bottom.equalTo(documentPickerView.snp.top)
    }
    documentPickerView.snp.makeConstraints { make in
      make.top.equalTo(view.snp.bottom)
      make.leading.trailing.equalToSuperview()
      make.height.equalTo(500)
    }
  }

  private func setupBindings() {
    chatManager.$currentSession
      .receive(on: DispatchQueue.main)
      .sink { [weak self] session in
        self?.updateMessages(for: session?.id)
      }
      .store(in: &cancellables)

    chatManager.$messages
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        if let sessionId = self?.chatManager.currentSession?.id {
          self?.updateMessages(for: sessionId)
        }
      }
      .store(in: &cancellables)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController!.setNavigationBarHidden(true, animated: animated)
    documentPickerView.updateDocumentsFromRecentDocs()
    DispatchQueue.main.async {
      self.inputBox.textView.becomeFirstResponder()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    navigationController!.setNavigationBarHidden(false, animated: animated)
  }

  @objc func terminateEditing() {
    view.endEditing(true)
  }

  // MARK: - Chat Methods

  private func updateMessages(for sessionId: String?) {
    guard let sessionId else {
      messages = []
      updateEmptyState()
      tableView.reloadData()
      return
    }

    messages = chatManager.messages[sessionId] ?? []
    updateEmptyState()
    tableView.reloadData()

    if !messages.isEmpty {
      let indexPath = IndexPath(row: messages.count - 1, section: 0)
      tableView.scrollToRow(at: indexPath, at: .bottom, animated: true)
    }
  }

  private func updateEmptyState() {
    emptyStateView.isHidden = !messages.isEmpty
    tableView.isHidden = messages.isEmpty
  }

  // MARK: - Internal Methods for Preview/Testing

  #if DEBUG
    func setMessagesForPreview(_ previewMessages: [ChatMessage]) {
      messages = previewMessages
      updateEmptyState()
      tableView.reloadData()
    }
  #endif
}

// MARK: - UITableViewDataSource

extension MainViewController: UITableViewDataSource {
  func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
    messages.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "ChatCell", for: indexPath) as! ChatCell
    let message = messages[indexPath.row]
    cell.configure(with: message)
    return cell
  }
}

// MARK: - UITableViewDelegate

extension MainViewController: UITableViewDelegate {
  func tableView(_: UITableView, heightForRowAt _: IndexPath) -> CGFloat {
    UITableView.automaticDimension
  }

  func tableView(_: UITableView, estimatedHeightForRowAt _: IndexPath) -> CGFloat {
    60
  }
}
