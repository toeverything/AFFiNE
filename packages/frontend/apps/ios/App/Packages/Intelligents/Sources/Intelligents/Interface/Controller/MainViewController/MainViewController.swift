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
    setupUI()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController!.setNavigationBarHidden(true, animated: animated)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    navigationController!.setNavigationBarHidden(false, animated: animated)
  }

  // MARK: - Setup

  private func setupUI() {
    view.backgroundColor = .systemBackground

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
  func inputBoxDidTapAddAttachment() {
    // TODO: 实现添加附件功能
    print("Add attachment tapped")
  }

  func inputBoxDidTapTool() {
    print("Tool toggled: \(inputBox.viewModel.isToolEnabled)")
  }

  func inputBoxDidTapNetwork() {
    print("Network toggled: \(inputBox.viewModel.isNetworkEnabled)")
  }

  func inputBoxDidTapDeepThinking() {
    print("Deep thinking toggled: \(inputBox.viewModel.isDeepThinkingEnabled)")
  }

  func inputBoxDidTapSend(data: InputBoxData) {
    // 处理发送逻辑
    guard !data.text.isEmpty else { return }
    print("[*] send tapped with text: \(data.text)")
  }

  func inputBoxTextDidChange(_ text: String) {
    // 可以在这里处理文本变化的其他逻辑
    print("Text changed: \(text)")
  }
}
