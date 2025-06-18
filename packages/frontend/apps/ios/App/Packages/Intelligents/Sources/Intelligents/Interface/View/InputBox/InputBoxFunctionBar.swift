import SnapKit
import Then
import UIKit

protocol InputBoxFunctionBarDelegate: AnyObject {
  func functionBarDidTapAttachment(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapTool(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapNetwork(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapDeepThinking(_ functionBar: InputBoxFunctionBar)
  func functionBarDidTapSend(_ functionBar: InputBoxFunctionBar)
}

private let unselectedColor: UIColor = .secondaryLabel
private let selectedColor: UIColor = .accent

class InputBoxFunctionBar: UIView {
  weak var delegate: InputBoxFunctionBarDelegate?

  lazy var attachmentButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.add.attachment", in: .module, with: nil), for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(attachmentButtonTapped), for: .touchUpInside)
  }

  lazy var toolButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.tool", in: .module, with: nil), for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(toolButtonTapped), for: .touchUpInside)
  }

  lazy var networkButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.network", in: .module, with: nil), for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(networkButtonTapped), for: .touchUpInside)
  }

  lazy var deepThinkingButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.deep.thinking", in: .module, with: nil), for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(deepThinkingButtonTapped), for: .touchUpInside)
  }

  lazy var sendButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.send", in: .module, with: nil), for: .normal)
    $0.tintColor = .white
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(sendButtonTapped), for: .touchUpInside)
  }

  lazy var leftButtonsStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 16
    $0.alignment = .center
    $0.addArrangedSubview(attachmentButton)
  }

  lazy var rightButtonsStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 16
    $0.alignment = .center
    $0.addArrangedSubview(toolButton)
    $0.addArrangedSubview(networkButton)
    $0.addArrangedSubview(deepThinkingButton)
    $0.addArrangedSubview(sendButton)
  }

  lazy var stackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .center
    $0.addArrangedSubview(leftButtonsStackView)
    $0.addArrangedSubview(UIView()) // spacer
    $0.addArrangedSubview(rightButtonsStackView)
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupViews()
    setupConstraints()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupViews() {
    addSubview(stackView)
  }

  private func setupConstraints() {
    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    for button in [attachmentButton, toolButton, networkButton, deepThinkingButton, sendButton] {
      button.snp.makeConstraints { make in
        make.width.height.equalTo(32)
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sendButton.layer.cornerRadius = sendButton.bounds.height / 2
    for button in [toolButton, networkButton, deepThinkingButton] {
      button.layer.cornerRadius = button.bounds.height / 2
    }
  }

  // MARK: - Public Methods

  func updateToolState(isEnabled: Bool) {
    toolButton.tintColor = isEnabled ? selectedColor : unselectedColor
  }

  func updateNetworkState(isEnabled: Bool) {
    networkButton.tintColor = isEnabled ? selectedColor : unselectedColor
  }

  func updateDeepThinkingState(isEnabled: Bool) {
    deepThinkingButton.tintColor = isEnabled ? selectedColor : unselectedColor
  }

  func updateSendState(canSend: Bool) {
    sendButton.isEnabled = canSend
    sendButton.alpha = canSend ? 1.0 : 0.5
  }

  // MARK: - Actions

  @objc private func attachmentButtonTapped() {
    delegate?.functionBarDidTapAttachment(self)
  }

  @objc private func toolButtonTapped() {
    delegate?.functionBarDidTapTool(self)
  }

  @objc private func networkButtonTapped() {
    delegate?.functionBarDidTapNetwork(self)
  }

  @objc private func deepThinkingButtonTapped() {
    delegate?.functionBarDidTapDeepThinking(self)
  }

  @objc private func sendButtonTapped() {
    delegate?.functionBarDidTapSend(self)
  }
}
