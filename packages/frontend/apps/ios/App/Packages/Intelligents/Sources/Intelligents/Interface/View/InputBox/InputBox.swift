import Combine
import SnapKit
import Then
import UIKit

class InputBox: UIView {
  weak var delegate: InputBoxDelegate?


  private lazy var containerView = UIView().then {
    $0.backgroundColor = UIColor.affineLayerBackgroundPrimary
    $0.layer.cornerRadius = 12
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor.affineLayerBorder.cgColor

    $0.layer.shadowColor = UIColor.black.cgColor
    $0.layer.shadowOffset = CGSize(width: 0, height: 0)
    $0.layer.shadowRadius = 12
    $0.layer.shadowOpacity = 0.075
    $0.clipsToBounds = false
  }

  lazy var textView = UITextView().then {
    $0.backgroundColor = .clear
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .label
    $0.isScrollEnabled = false
    $0.textContainer.lineFragmentPadding = 0
    $0.textContainerInset = .zero
    $0.delegate = self
    $0.text = ""
  }

  lazy var placeholderLabel = UILabel().then {
    $0.text = "Write your message..."
    $0.font = .systemFont(ofSize: 16)
    $0.textColor = .systemGray3
    $0.isHidden = true
  }

  private lazy var addButton = UIButton(type: .system).then {
    $0.backgroundColor = UIColor.affineLayerBackgroundPrimary
    $0.layer.cornerRadius = 6
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor.affineLayerBorder.cgColor
    $0.setImage(UIImage.affinePlus, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(addButtonTapped), for: .touchUpInside)
  }

  private lazy var toolButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineTools, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(toolButtonTapped), for: .touchUpInside)
  }

  private lazy var webButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineWeb, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(webButtonTapped), for: .touchUpInside)
  }

  private lazy var reactButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineThink, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(reactButtonTapped), for: .touchUpInside)
  }

  private lazy var sendButton = UIButton(type: .system).then {
    $0.backgroundColor = UIColor.affineButtonPrimary
    $0.layer.cornerRadius = 19
    $0.setImage(UIImage.affineArrowUpBig, for: .normal)
    $0.tintColor = UIColor.affineLayerPureWhite
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

  lazy var imageBar = InputBoxImageBar().then {
    $0.imageBarDelegate = self
  }

  lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 16
    $0.alignment = .fill
    $0.addArrangedSubview(imageBar)
    $0.addArrangedSubview(textView)
    $0.addArrangedSubview(functionBar)
  }

 
  private var textViewHeightConstraint: Constraint?
  private let minTextViewHeight: CGFloat = 48
  private let maxTextViewHeight: CGFloat = 140
 

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
      make.edges.equalToSuperview().inset(8)
    }

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(8)
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
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
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
