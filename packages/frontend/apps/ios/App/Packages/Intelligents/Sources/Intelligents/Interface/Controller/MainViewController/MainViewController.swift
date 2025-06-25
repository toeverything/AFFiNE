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

  private var cancellables = Set<AnyCancellable>()
  private let intelligentContext = IntelligentContext.shared
  var terminateEditGesture: UITapGestureRecognizer!

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
    view.addSubview(documentPickerHideDetector)
    view.addSubview(documentPickerView)

    headerView.snp.makeConstraints { make in
      make.top.equalTo(view.safeAreaLayoutGuide)
      make.leading.trailing.equalToSuperview()
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

    view.isUserInteractionEnabled = true
    terminateEditGesture = UITapGestureRecognizer(target: self, action: #selector(terminateEditing))
    view.addGestureRecognizer(terminateEditGesture)
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
}
