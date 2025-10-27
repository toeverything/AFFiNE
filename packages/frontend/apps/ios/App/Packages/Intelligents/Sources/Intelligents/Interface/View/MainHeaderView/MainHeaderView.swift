import SnapKit
import UIKit

class MainHeaderView: UIView {
  weak var delegate: MainHeaderViewDelegate?

  private lazy var closeButton = UIButton(type: .system).then {
    $0.imageView?.contentMode = .scaleAspectFit
    $0.setImage(UIImage.affineClose, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.backgroundColor = UIColor.affineLayerBackgroundSecondary
    $0.layer.cornerRadius = 8
    $0.addTarget(self, action: #selector(closeButtonTapped), for: .touchUpInside)
    $0.setContentHuggingPriority(.required, for: .horizontal)
  }

  private lazy var titleLabel = UILabel().then {
    $0.text = "AFFiNE AI"
    $0.font = .systemFont(ofSize: 16, weight: .medium)
    $0.textColor = UIColor.affineTextPrimary
    $0.textAlignment = .center
  }

  private lazy var modelMenu = UIDeferredMenuElement.uncached { completion in
    completion([])
  }

  private lazy var dropdownButton = UIButton(type: .system).then {
    $0.imageView?.contentMode = .scaleAspectFit
    $0.setImage(UIImage.affineArrowDown, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.addTarget(self, action: #selector(dropdownButtonTapped), for: .touchUpInside)
    $0.showsMenuAsPrimaryAction = true
    $0.menu = UIMenu(options: [.displayInline], children: [
      modelMenu,
    ])
    $0.isHidden = true
  }

  private lazy var centerStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.spacing = 8
    $0.alignment = .center
    $0.addArrangedSubview(titleLabel)
    $0.addArrangedSubview(dropdownButton)
  }

  private lazy var menuButton = UIButton(type: .system).then {
    $0.imageView?.contentMode = .scaleAspectFit
    $0.setImage(UIImage.affineMore, for: .normal)
    $0.tintColor = UIColor.affineIconPrimary
    $0.backgroundColor = UIColor.affineLayerBackgroundSecondary
    $0.layer.cornerRadius = 8
    $0.addTarget(self, action: #selector(menuButtonTapped), for: .touchUpInside)
    $0.setContentHuggingPriority(.required, for: .horizontal)
    $0.showsMenuAsPrimaryAction = true
    $0.menu = .init(options: [.displayInline], children: [
      UIAction(title: "Clear History", image: .affineBroom, handler: { _ in
        ChatManager.shared.clearCurrentSession()
        ChatManager.shared.clearAll()
      }),
    ])
  }

  private lazy var leftSpacerView = UIView()

  private lazy var rightSpacerView = UIView()

  private lazy var mainStackView = UIStackView().then {
    $0.axis = .horizontal
    $0.alignment = .center
    $0.distribution = .fill
    $0.spacing = 16
    $0.addArrangedSubview(closeButton)
    $0.addArrangedSubview(leftSpacerView)
    $0.addArrangedSubview(centerStackView)
    $0.addArrangedSubview(rightSpacerView)
    $0.addArrangedSubview(menuButton)
  }

  init() {
    super.init(frame: .zero)

    backgroundColor = UIColor.affineLayerBackgroundPrimary
    addSubview(mainStackView)

    mainStackView.snp.makeConstraints { make in
      make.left.right.equalToSuperview().inset(16)
      make.centerY.equalToSuperview()
    }

    closeButton.snp.makeConstraints { make in
      make.size.equalTo(titleLabel.font.pointSize + 16)
    }

    menuButton.snp.makeConstraints { make in
      make.size.equalTo(titleLabel.font.pointSize + 16)
    }

    dropdownButton.snp.makeConstraints { make in
      make.size.equalTo(titleLabel.font.pointSize + 16)
    }

    // ensure center stack to be center
    leftSpacerView.snp.makeConstraints { make in
      make.width.equalTo(rightSpacerView)
    }

    snp.makeConstraints { make in
      make.height.equalTo(52)
    }
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    fatalError()
  }

  @objc private func closeButtonTapped() {
    delegate?.mainHeaderViewDidTapClose()
  }

  @objc private func dropdownButtonTapped() {
    delegate?.mainHeaderViewDidTapDropdown()
  }

  @objc private func menuButtonTapped() {
    delegate?.mainHeaderViewDidTapMenu()
  }
}
