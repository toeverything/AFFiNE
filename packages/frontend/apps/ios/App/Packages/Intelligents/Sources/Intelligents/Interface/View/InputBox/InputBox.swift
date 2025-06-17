import SnapKit
import Then
import UIKit

protocol InputBoxDelegate: AnyObject {
  func inputBoxDidTapAddAttachment()
  func inputBoxDidTapTool()
  func inputBoxDidTapNetwork()
  func inputBoxDidTapDeepThinking()
  func inputBoxDidTapSend()
  func inputBoxTextDidChange(_ text: String)
}

class InputBox: UIView {
  weak var delegate: InputBoxDelegate?

  private lazy var containerView = UIView().then {
    $0.backgroundColor = .systemBackground
    $0.layer.cornerRadius = 12
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor.systemGray4.cgColor
    $0.layer.shadowColor = UIColor.black.cgColor
    $0.layer.shadowOffset = CGSize(width: 0, height: 2)
    $0.layer.shadowRadius = 6
    $0.layer.shadowOpacity = 0.04
    $0.clipsToBounds = false
  }

  private lazy var textView = UITextView().then {
    $0.backgroundColor = .clear
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
    $0.isScrollEnabled = false
    $0.textContainer.lineFragmentPadding = 0
    $0.textContainerInset = .zero
    $0.delegate = self
    $0.text = "This is AFFiNE AI"
  }

  private lazy var placeholderLabel = UILabel().then {
    $0.text = "Write your message..."
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .systemGray3
    $0.isHidden = true
  }

  private lazy var addButton = UIButton(type: .system).then {
    $0.backgroundColor = .systemBackground
    $0.layer.cornerRadius = 6
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor.systemGray4.cgColor
    $0.setImage(UIImage(named: "inputbox.add.attachment", in: .module, with: nil), for: .normal)
    $0.tintColor = .secondaryLabel
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(addButtonTapped), for: .touchUpInside)
  }

  private lazy var toolButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.tool", in: .module, with: nil), for: .normal)
    $0.tintColor = .secondaryLabel
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(toolButtonTapped), for: .touchUpInside)
  }

  private lazy var webButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.network", in: .module, with: nil), for: .normal)
    $0.tintColor = .secondaryLabel
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(webButtonTapped), for: .touchUpInside)
  }

  private lazy var reactButton = UIButton(type: .system).then {
    $0.setImage(UIImage(named: "inputbox.deep.thinking", in: .module, with: nil), for: .normal)
    $0.tintColor = .secondaryLabel
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(reactButtonTapped), for: .touchUpInside)
  }

  private lazy var sendButton = UIButton(type: .system).then {
    $0.backgroundColor = UIColor.systemBlue
    $0.layer.cornerRadius = 19
    $0.setImage(UIImage(named: "inputbox.send", in: .module, with: nil), for: .normal)
    $0.tintColor = .white
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(sendButtonTapped), for: .touchUpInside)
  }

  private lazy var leftButtonsStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 16
    $0.alignment = .center
    $0.addArrangedSubview(addButton)
  }

  private lazy var rightButtonsStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 16
    $0.alignment = .center
    $0.addArrangedSubview(toolButton)
    $0.addArrangedSubview(webButton)
    $0.addArrangedSubview(reactButton)
    $0.addArrangedSubview(sendButton)
  }

  private lazy var functionsStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 12
    $0.alignment = .center
    $0.addArrangedSubview(leftButtonsStackView)
    $0.addArrangedSubview(UIView()) // spacer
    $0.addArrangedSubview(rightButtonsStackView)
  }

  private lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 16
    $0.alignment = .fill
    $0.addArrangedSubview(textView)
    $0.addArrangedSubview(functionsStackView)
  }

  private var textViewHeightConstraint: Constraint?
  private let minTextViewHeight: CGFloat = 22
  private let maxTextViewHeight: CGFloat = 100

  var text: String {
    get { textView.text ?? "" }
    set {
      textView.text = newValue
      updatePlaceholderVisibility()
      updateTextViewHeight()
    }
  }

  init() {
    super.init(frame: .zero)
    setupViews()
    setupConstraints()
    updatePlaceholderVisibility()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupViews() {
    backgroundColor = .clear
    addSubview(containerView)
    containerView.addSubview(mainStackView)
    containerView.addSubview(placeholderLabel)
  }

  private func setupConstraints() {
    containerView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(16)
    }

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(16)
    }

    addButton.snp.makeConstraints { make in
      make.size.equalTo(38)
    }

    for button in [toolButton, webButton, reactButton] {
      button.snp.makeConstraints { make in
        make.size.equalTo(24)
      }
    }

    sendButton.snp.makeConstraints { make in
      make.size.equalTo(38)
    }

    textView.snp.makeConstraints { make in
      textViewHeightConstraint = make.height.equalTo(minTextViewHeight).constraint
    }

    placeholderLabel.snp.makeConstraints { make in
      make.left.right.equalTo(textView)
      make.top.equalTo(textView)
    }
  }

  private func updateTextViewHeight() {
    let size = textView.sizeThatFits(CGSize(width: textView.frame.width, height: CGFloat.greatestFiniteMagnitude))
    let newHeight = max(minTextViewHeight, min(maxTextViewHeight, size.height))

    textViewHeightConstraint?.update(offset: newHeight)
    textView.isScrollEnabled = size.height > maxTextViewHeight

    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 0.8,
      initialSpringVelocity: 1.0,
      options: [.curveEaseInOut]
    ) {
      self.layoutIfNeeded()
      self.superview?.layoutIfNeeded()
    }
  }

  private func updatePlaceholderVisibility() {
    placeholderLabel.isHidden = !textView.text.isEmpty
  }

  @objc private func addButtonTapped() {
    delegate?.inputBoxDidTapAddAttachment()
  }

  @objc private func toolButtonTapped() {
    delegate?.inputBoxDidTapTool()
  }

  @objc private func webButtonTapped() {
    delegate?.inputBoxDidTapNetwork()
  }

  @objc private func reactButtonTapped() {
    delegate?.inputBoxDidTapDeepThinking()
  }

  @objc private func sendButtonTapped() {
    delegate?.inputBoxDidTapSend()
  }
}

// MARK: - UITextViewDelegate

extension InputBox: UITextViewDelegate {
  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholderVisibility()
    updateTextViewHeight()
    delegate?.inputBoxTextDidChange(textView.text)
  }
}
