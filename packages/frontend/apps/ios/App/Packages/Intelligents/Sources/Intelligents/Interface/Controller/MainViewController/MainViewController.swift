import Combine
import SnapKit
import Then
import UIKit

class MainViewController: UIViewController {
  // MARK: - UI Components

  lazy var headerView = MainHeaderView().then {
    $0.delegate = self
  }

  lazy var inputBox = InputBox().then {
    $0.delegate = self
  }

  // MARK: - Properties

  private var cancellables = Set<AnyCancellable>()
  private let intelligentContext = IntelligentContext.shared

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .affineLayerBackgroundPrimary

    let inputBox = InputBox().then {
      $0.delegate = self
    }
    self.inputBox = inputBox

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

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController!.setNavigationBarHidden(true, animated: animated)
    DispatchQueue.main.async {
      self.inputBox.textView.becomeFirstResponder()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    navigationController!.setNavigationBarHidden(false, animated: animated)
  }
}
