import SnapKit
import UIKit

final class FileAttachmentHeaderView: UIView {
  // MARK: - Properties

  weak var delegate: FileAttachmentHeaderViewDelegate?

  // MARK: - UI Components

  private lazy var iconImageView = UIImageView().then {
    $0.contentMode = .scaleAspectFit
    $0.image = UIImage(systemName: "doc.fill")
    $0.tintColor = UIColor.systemBlue
    $0.isUserInteractionEnabled = true
    let tap = UITapGestureRecognizer(target: self, action: #selector(iconTapped))
    $0.addGestureRecognizer(tap)
  }

  private lazy var textStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 2
    $0.alignment = .leading
    $0.distribution = .equalSpacing
  }

  private lazy var primaryLabel = UILabel().then {
    $0.text = "" // 3 attachment, 1 AFFiNE docs
    $0.font = UIFont.preferredFont(forTextStyle: .footnote).bold
    $0.textColor = .label
    $0.numberOfLines = 1
  }

  private lazy var secondaryLabel = UILabel().then {
    $0.text = "Referenced for AI"
    $0.font = UIFont.preferredFont(forTextStyle: .footnote)
    $0.textColor = .affineTextSecondary
    $0.numberOfLines = 1
  }

  private lazy var arrowButton = UIImageView().then {
    $0.image = UIImage(systemName: "chevron.down")
    $0.contentMode = .scaleAspectFit
    $0.tintColor = .affineIconPrimary
  }

  // MARK: - Initialization

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupUI() {
    backgroundColor = UIColor.white
    layer.cornerRadius = 12
    layer.borderWidth = 0.5
    layer.borderColor = UIColor.systemGray5.cgColor
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOffset = CGSize(width: 0, height: 2)
    layer.shadowRadius = 6
    layer.shadowOpacity = 0.04

    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(viewTapped))
    addGestureRecognizer(tapGesture)

    addSubviews()
    setupConstraints()
    setupStackView()
  }

  private func addSubviews() {
    addSubview(iconImageView)
    addSubview(textStackView)
    addSubview(arrowButton)
  }

  private func setupConstraints() {
    iconImageView.snp.makeConstraints { make in
      make.leading.equalToSuperview().offset(12)
      make.size.equalTo(24)
      make.centerY.equalToSuperview()
      make.top.greaterThanOrEqualToSuperview().inset(12)
      make.bottom.lessThanOrEqualToSuperview().inset(12)
    }

    textStackView.snp.makeConstraints { make in
      make.leading.equalTo(iconImageView.snp.trailing).offset(12)
      make.trailing.lessThanOrEqualTo(arrowButton.snp.leading).offset(-12)
      make.centerY.equalToSuperview()
      make.top.greaterThanOrEqualToSuperview().inset(12)
      make.bottom.lessThanOrEqualToSuperview().inset(12)
    }

    arrowButton.snp.makeConstraints { make in
      make.trailing.equalToSuperview().offset(-12)
      make.centerY.equalToSuperview()
      make.width.equalTo(18)
      make.height.equalTo(18)
    }
  }

  private func setupStackView() {
    textStackView.addArrangedSubview(primaryLabel)
    textStackView.addArrangedSubview(secondaryLabel)
  }

  // MARK: - Actions

  @objc private func viewTapped() {
    delegate?.headerViewDidTapManagement(self)
  }

  @objc private func iconTapped() {
    delegate?.headerViewDidPickMore(self)
  }

  // MARK: - Public Methods

  func updateContent(attachmentCount: Int, docsCount: Int) {
    var components: [String] = []

    if attachmentCount > 0 {
      components.append("\(attachmentCount) attachment\(attachmentCount > 1 ? "s" : "")")
    }

    if docsCount > 0 {
      components.append("\(docsCount) AFFiNE doc\(docsCount > 1 ? "s" : "")")
    }

    primaryLabel.text = components.joined(separator: ", ")
  }

  func setIconImage(_ image: UIImage?) {
    iconImageView.image = image
  }

  // MARK: - Trait Collection

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)

    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
      layer.borderColor = UIColor.systemGray5.cgColor
    }
  }
}

// MARK: - Preview

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  struct FileAttachmentHeaderView_Previews: PreviewProvider {
    static var previews: some View {
      UIViewPreview {
        let view = FileAttachmentHeaderView()
        view.updateContent(attachmentCount: 5, docsCount: 2)
        view.snp.makeConstraints { make in
          make.width.equalTo(400)
        }
        return view
      }
      .previewLayout(.fixed(width: 400, height: 100))
      .previewDisplayName("File Attachment Header")
    }
  }
#endif
