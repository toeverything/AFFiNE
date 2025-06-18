import Combine
import SnapKit
import Then
import UIKit

class MainViewController: UIViewController {
  // MARK: - UI Components

  private lazy var headerView = MainHeaderView().then {
    $0.delegate = self
  }

  private lazy var inputBox = InputBox().then {
    $0.delegate = self
  }

  // MARK: - Properties

  private var cancellables = Set<AnyCancellable>()
  private let intelligentContext = IntelligentContext.shared

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.layoutIfNeeded()
    setupUI()
    view.layoutIfNeeded()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController!.setNavigationBarHidden(true, animated: animated)
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    inputBox.textView.becomeFirstResponder()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    navigationController!.setNavigationBarHidden(false, animated: animated)
  }

  // MARK: - Setup

  private func setupUI() {
    view.backgroundColor = .systemBackground

    // 计算 InputBox 的初始 frame 以避免布局动画
    let inputBoxFrame = CGRect(
      x: 0,
      y: view.bounds.height - 150, // 预估高度
      width: view.bounds.width,
      height: 150
    )
    let inputBox = InputBox(frame: inputBoxFrame).then {
      $0.delegate = self
    }
    self.inputBox = inputBox
    self.inputBox.layoutIfNeeded()

    view.addSubview(headerView)
    view.addSubview(inputBox)

    headerView.snp.makeConstraints { make in
      make.top.equalTo(view.safeAreaLayoutGuide)
      make.leading.trailing.equalToSuperview()
    }

    inputBox.snp.makeConstraints { make in
      make.leading.trailing.equalToSuperview()
      make.bottom.equalTo(view.keyboardLayoutGuide.snp.top)
    }
  }
}

// MARK: - MainHeaderViewDelegate

extension MainViewController: MainHeaderViewDelegate {
  func mainHeaderViewDidTapClose() {
    dismiss(animated: true)
  }

  func mainHeaderViewDidTapDropdown() {
    // TODO: 实现下拉功能
    print("Dropdown tapped")
  }

  func mainHeaderViewDidTapMenu() {
    // TODO: 实现菜单功能
    print("Menu tapped")
  }
}

// MARK: - InputBoxDelegate

extension MainViewController: InputBoxDelegate {
  func inputBoxDidSelectAttachment(_ inputBox: InputBox) {
    print(#function, inputBox)
  }

  func inputBoxDidSend(_ inputBox: InputBox) {
    print(#function, inputBox, inputBox.viewModel)
  }

  func inputBoxTextDidChange(_ text: String) {
    print(#function, text)
  }
}
