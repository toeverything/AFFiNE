import Combine
import SnapKit
import Then
import UIKit

class InputBox: UIView {
  weak var delegate: InputBoxDelegate?

  public let viewModel = InputBoxViewModel()
  var cancellables = Set<AnyCancellable>()

  lazy var containerView = UIView().then {
    $0.backgroundColor = UIColor.affineLayerBackgroundPrimary
    $0.layer.cornerRadius = 16
    $0.layer.cornerCurve = .continuous
    $0.layer.borderWidth = 1
    $0.layer.shadowColor = UIColor.black.cgColor
    $0.layer.shadowOffset = CGSize(width: 0, height: 0)
    $0.layer.shadowRadius = 12
    $0.layer.shadowOpacity = 0.075
    $0.clipsToBounds = false
  }

  lazy var textView = UITextView().then {
    $0.backgroundColor = .clear
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = UIColor.affineTextPrimary
    $0.isScrollEnabled = false
    $0.textContainer.lineFragmentPadding = 0
    $0.textContainerInset = .zero
    $0.delegate = self
    $0.text = ""
  }

  lazy var placeholderLabel = UILabel().then {
    $0.text = "Write your message..."
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = UIColor.affineTextPlaceholder
    $0.isHidden = true
  }

  lazy var functionBar = InputBoxFunctionBar().then {
    $0.delegate = self
  }

  lazy var imageBar = InputBoxImageBar().then {
    $0.imageBarDelegate = self
  }

  lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 16
    $0.alignment = .fill
    $0.clipsToBounds = true
    $0.addArrangedSubview(imageBar)
    $0.addArrangedSubview(textView)
    $0.addArrangedSubview(functionBar)
  }

  var textViewHeightConstraint: Constraint?
  let minTextViewHeight: CGFloat = 22
  let maxTextViewHeight: CGFloat = 100

  var text: String {
    get { textView.text ?? "" }
    set {
      textView.text = newValue
      updatePlaceholderVisibility()
      updateTextViewHeight()
    }
  }

  override init(frame: CGRect = .zero) {
    super.init(frame: frame)

    backgroundColor = .clear
    addSubview(containerView)
    containerView.addSubview(mainStackView)
    containerView.addSubview(placeholderLabel)
    imageBar.isHidden = true

    containerView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(16)
    }

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(16)
    }

    imageBar.snp.makeConstraints { make in
      make.left.right.equalToSuperview()
    }

    textView.snp.makeConstraints { make in
      textViewHeightConstraint = make.height.equalTo(minTextViewHeight).constraint
    }

    placeholderLabel.snp.makeConstraints { make in
      make.left.right.equalTo(textView)
      make.top.equalTo(textView)
    }

    setupBindings()
    updatePlaceholderVisibility()
    updateColors()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
      updateColors()
    }
  }

  func setupBindings() {
    // 绑定 ViewModel 到 UI
    viewModel.$inputText
      .removeDuplicates()
      .sink { [weak self] text in
        if self?.textView.text != text {
          self?.textView.text = text
          self?.updatePlaceholderVisibility()
          self?.updateTextViewHeight()
        }
      }
      .store(in: &cancellables)

    viewModel.$isToolEnabled
      .removeDuplicates()
      .sink { [weak self] enabled in
        self?.functionBar.updateToolState(isEnabled: enabled)
      }
      .store(in: &cancellables)

    viewModel.$isNetworkEnabled
      .removeDuplicates()
      .sink { [weak self] enabled in
        self?.functionBar.updateNetworkState(isEnabled: enabled)
      }
      .store(in: &cancellables)

    viewModel.$isDeepThinkingEnabled
      .removeDuplicates()
      .sink { [weak self] enabled in
        self?.functionBar.updateDeepThinkingState(isEnabled: enabled)
      }
      .store(in: &cancellables)

    viewModel.$canSend
      .removeDuplicates()
      .sink { [weak self] canSend in
        self?.functionBar.updateSendState(canSend: canSend)
      }
      .store(in: &cancellables)

    viewModel.$hasAttachments
      .dropFirst() // for view setup
      .removeDuplicates()
      .sink { [weak self] hasAttachments in
        performWithAnimation {
          self?.updateImageBarVisibility(hasAttachments)
          self?.layoutIfNeeded()
        }
      }
      .store(in: &cancellables)

    viewModel.$attachments
      .removeDuplicates()
      .sink { [weak self] attachments in
        self?.updateImageBarContent(attachments)
      }
      .store(in: &cancellables)
  }

  func updateTextViewHeight() {
    let size = textView.sizeThatFits(CGSize(width: textView.frame.width, height: CGFloat.greatestFiniteMagnitude))
    let newHeight = max(minTextViewHeight, min(maxTextViewHeight, size.height))

    let height = textView.frame.height
    guard height != newHeight else { return }

    textViewHeightConstraint?.update(offset: newHeight)
    textView.isScrollEnabled = size.height > maxTextViewHeight

    if height == 0 || superview == nil || window == nil || isHidden { return }

    performWithAnimation {
      self.layoutIfNeeded()
      self.superview?.layoutIfNeeded()
    }
  }

  func updatePlaceholderVisibility() {
    placeholderLabel.isHidden = !textView.text.isEmpty
  }

  func updateImageBarVisibility(_ hasAttachments: Bool) {
    imageBar.isHidden = !hasAttachments
  }

  func updateImageBarContent(_ attachments: [InputAttachment]) {
    imageBar.updateImageBarContent(attachments)
  }

  func updateColors() {
    containerView.layer.borderColor = UIColor.affineLayerBorder.cgColor
  }

  // MARK: - Public Methods

  public func addImageAttachment(_ image: UIImage) {
    guard let imageData = image.jpegData(compressionQuality: 0.8) else { return }

    let attachment = InputAttachment(
      type: .image,
      data: imageData,
      name: "image.jpg",
      size: Int64(imageData.count)
    )

    performWithAnimation { [self] in
      viewModel.addAttachment(attachment)
      layoutIfNeeded()
    }
  }

  public func addFileAttachment(_ url: URL) {
    guard let fileData = try? Data(contentsOf: url) else { return }

    let attachment = InputAttachment(
      type: .file,
      data: fileData,
      name: url.lastPathComponent,
      size: Int64(fileData.count)
    )

    performWithAnimation { [self] in
      viewModel.addAttachment(attachment)
      layoutIfNeeded()
    }
  }

  public var inputBoxData: InputBoxData {
    viewModel.prepareSendData()
  }
}

// MARK: - InputBoxFunctionBarDelegate

extension InputBox: InputBoxFunctionBarDelegate {
  func functionBarDidTapTakePhoto(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectTakePhoto(self)
  }

  func functionBarDidTapPhotoLibrary(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectPhotoLibrary(self)
  }

  func functionBarDidTapAttachFiles(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectAttachFiles(self)
  }

  func functionBarDidTapEmbedDocs(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSelectEmbedDocs(self)
  }

  func functionBarDidTapTool(_: InputBoxFunctionBar) {
    viewModel.toggleTool()
  }

  func functionBarDidTapNetwork(_: InputBoxFunctionBar) {
    viewModel.toggleNetwork()
  }

  func functionBarDidTapDeepThinking(_: InputBoxFunctionBar) {
    viewModel.toggleDeepThinking()
  }

  func functionBarDidTapSend(_: InputBoxFunctionBar) {
    delegate?.inputBoxDidSend(self)
  }
}
