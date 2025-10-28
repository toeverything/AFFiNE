import Combine
import SnapKit
import UIKit

class InputBox: UIView {
  weak var delegate: InputBoxDelegate?

  let viewModel = InputBoxViewModel()
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
    $0.returnKeyType = .send
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

  lazy var imageBar = ImageAttachmentBar().then {
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

  lazy var fileAttachmentHeader = FileAttachmentHeaderView().then {
    $0.delegate = self
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
    addSubview(fileAttachmentHeader)
    addSubview(containerView)
    containerView.addSubview(mainStackView)
    containerView.addSubview(placeholderLabel)
    imageBar.isHidden = true

    containerView.snp.makeConstraints { make in
      make.left.bottom.right.equalToSuperview().inset(16)
      make.top.greaterThanOrEqualToSuperview().offset(16)
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

    // for initial status
    fileAttachmentHeader.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(32).priority(.high)
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

    viewModel.$isSearchEnabled
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

    viewModel.$imageAttachments
      .dropFirst() // for view setup to remove animation
      .map { !$0.isEmpty /* -> hasAttachments */ }
      .removeDuplicates()
      .sink { [weak self] hasAttachments in
        performWithAnimation {
          self?.updateImageBarVisibility(hasAttachments)
          self?.layoutIfNeeded()
        }
      }
      .store(in: &cancellables)

    viewModel.$imageAttachments
      .removeDuplicates()
      .sink { [weak self] attachments in
        self?.updateImageBarContent(attachments)
      }
      .store(in: &cancellables)

    Publishers.CombineLatest(viewModel.$fileAttachments, viewModel.$documentAttachments)
      .dropFirst() // for view setup to remove animation
      .removeDuplicates { $0.0 == $1.0 && $0.1 == $1.1 }
      .sink { [weak self] fileAttachments, documentAttachments in
        self?.updateFileAttachmentHeader(fileCount: fileAttachments.count, documentCount: documentAttachments.count)
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

  func updateImageBarContent(_ attachments: [ImageAttachment]) {
    imageBar.updateImageBarContent(attachments)
  }

  func updateFileAttachmentHeader(fileCount: Int, documentCount: Int) {
    let hasAttachments = fileCount > 0 || documentCount > 0

    fileAttachmentHeader.snp.remakeConstraints { make in
      if hasAttachments {
        make.leading.trailing.equalToSuperview().inset(32)
        make.bottom.equalTo(self.containerView.snp.top).offset(8)
        make.top.equalToSuperview().offset(8)
      } else {
        make.edges.equalToSuperview().inset(32).priority(.high)
      }
    }

    performWithAnimation {
      self.fileAttachmentHeader.isHidden = !hasAttachments
      if hasAttachments {
        self.fileAttachmentHeader.updateContent(attachmentCount: fileCount, docsCount: documentCount)
        self.fileAttachmentHeader.setIconImage(UIImage(systemName: "doc"))
      }
      self.layoutIfNeeded()
      self.superview?.layoutIfNeeded()
    }
  }

  func updateColors() {
    containerView.layer.borderColor = UIColor.affineLayerBorder.cgColor
  }

  // MARK: - Public Methods

  func addImageAttachment(_ image: UIImage) {
    let attachment = ImageAttachment(image: image)

    performWithAnimation { [self] in
      viewModel.addImageAttachment(attachment)
      layoutIfNeeded()
    }
  }

  func addFileAttachment(_ url: URL) throws {
    // check less then 15mb
    let fileSizeLimit: Int64 = 15 * 1024 * 1024 // 15 MB
    let fileAttributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard let fileSize = fileAttributes[.size] as? Int64, fileSize <= fileSizeLimit else {
      throw NSError(
        domain: "FileAttachmentErrorDomain",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "File size exceeds 15 MB limit."]
      )
    }
    let fileData = try Data(contentsOf: url)

    let attachment = FileAttachment(
      data: fileData,
      url: url,
      name: url.lastPathComponent,
      size: Int64(fileData.count)
    )

    performWithAnimation { [self] in
      viewModel.addFileAttachment(attachment)
      layoutIfNeeded()
    }
  }

  func addDocumentAttachment(_ documentAttachment: DocumentAttachment) {
    performWithAnimation { [self] in
      viewModel.addDocumentAttachment(documentAttachment)
      layoutIfNeeded()
    }
  }

  var inputBoxData: InputBoxData {
    viewModel.prepareSendData()
  }
}
