import SnapKit
import UIKit

private let unselectedColor: UIColor = .affineIconPrimary
private let selectedColor: UIColor = .affineIconActivated

private let configurableOptions: [ConfigurableOptions] = [
//  .networking,
//  .reasoning,
]
enum ConfigurableOptions {
  case tool
  case networking
  case reasoning
}

class InputBoxFunctionBar: UIView {
  weak var delegate: InputBoxFunctionBarDelegate?

  lazy var attachmentButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affinePlus, for: .normal)
    $0.tintColor = unselectedColor
    $0.layer.borderWidth = 1
    $0.layer.cornerRadius = 4
    $0.imageView?.contentMode = .scaleAspectFit
    $0.showsMenuAsPrimaryAction = true
    $0.menu = createAttachmentMenu()
  }

  lazy var toolButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineTools, for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(toolButtonTapped), for: .touchUpInside)
    $0.isHidden = !configurableOptions.contains(.tool)
  }

  lazy var networkButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineWeb, for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(networkButtonTapped), for: .touchUpInside)
    $0.isHidden = !configurableOptions.contains(.networking)
  }

  lazy var deepThinkingButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineThink, for: .normal)
    $0.tintColor = unselectedColor
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(deepThinkingButtonTapped), for: .touchUpInside)
    $0.isHidden = !configurableOptions.contains(.reasoning)
  }

  lazy var sendButton = UIButton(type: .system).then {
    $0.setImage(UIImage.affineArrowUpBig, for: .normal)
    $0.tintColor = UIColor.affineTextPureWhite
    $0.backgroundColor = UIColor.affineButtonPrimary
    $0.imageView?.contentMode = .scaleAspectFit
    $0.addTarget(self, action: #selector(sendButtonTapped), for: .touchUpInside)
    $0.clipsToBounds = true
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
    addSubview(stackView)
    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    for button in [attachmentButton, toolButton, networkButton, deepThinkingButton, sendButton] {
      button.snp.makeConstraints { make in
        make.width.height.equalTo(32)
      }
    }
    sendButton.layer.cornerRadius = 16
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

  // MARK: - Private Methods

  private func updateColors() {
    attachmentButton.layer.borderColor = UIColor.affineLayerBorder.cgColor
  }

  private func createAttachmentMenu() -> UIMenu {
    let takePhotoAction = UIAction(
      title: "Take Photo or Video",
      image: UIImage.affineCamera
    ) { [weak self] _ in
      guard let self else { return }
      delegate?.functionBarDidTapTakePhoto(self)
    }

    let photoLibraryAction = UIAction(
      title: "Photo Library",
      image: UIImage.affineImage
    ) { [weak self] _ in
      guard let self else { return }
      delegate?.functionBarDidTapPhotoLibrary(self)
    }

    let attachFilesAction = UIAction(
      title: "Attach Files (.pdf, .txt, .csv)",
      image: UIImage.affineUpload
    ) { [weak self] _ in
      guard let self else { return }
      delegate?.functionBarDidTapAttachFiles(self)
    }

    let embedDocsAction = UIAction(
      title: "Add AFFiNE Docs",
      image: UIImage.affinePage
    ) { [weak self] _ in
      guard let self else { return }
      delegate?.functionBarDidTapEmbedDocs(self)
    }

    return UIMenu(
      options: [.displayInline],
      children: [takePhotoAction, photoLibraryAction, attachFilesAction, embedDocsAction].reversed()
    )
  }

  // MARK: - Actions

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
