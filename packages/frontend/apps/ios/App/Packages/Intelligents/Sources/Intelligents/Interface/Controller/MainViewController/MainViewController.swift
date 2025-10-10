import Combine
import SnapKit
import UIKit

class MainViewController: UIViewController {
  // MARK: - UI Components

  lazy var headerView = MainHeaderView().then {
    $0.delegate = self
  }

  lazy var listView = ChatListView()

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

  var cancellables = Set<AnyCancellable>()
  let intelligentContext = IntelligentContext.shared
  let chatManager = ChatManager.shared
  var terminateEditGesture: UITapGestureRecognizer!

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .affineLayerBackgroundPrimary

    setupUI()

    view.isUserInteractionEnabled = true
    terminateEditGesture = UITapGestureRecognizer(target: self, action: #selector(terminateEditing))
    view.addGestureRecognizer(terminateEditGesture)
  }

  // MARK: - Setup

  private func setupUI() {
    view.addSubview(headerView)
    view.addSubview(listView)
    view.addSubview(inputBox)
    view.addSubview(documentPickerHideDetector)
    view.addSubview(documentPickerView)

    headerView.snp.makeConstraints { make in
      make.top.equalTo(view.safeAreaLayoutGuide)
      make.leading.trailing.equalToSuperview()
    }

    listView.snp.makeConstraints { make in
      make.top.equalTo(headerView.snp.bottom)
      make.left.right.equalToSuperview()
      make.bottom.equalToSuperview()
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

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()

    let bottomAnchor = inputBox.frame.minY
    let bottomInset = view.bounds.height - bottomAnchor + 64
    if listView.listView.bottomInset != bottomInset {
      listView.listView.bottomInset = bottomInset
    }
  }

  @objc func terminateEditing() {
    view.endEditing(true)
  }
}
