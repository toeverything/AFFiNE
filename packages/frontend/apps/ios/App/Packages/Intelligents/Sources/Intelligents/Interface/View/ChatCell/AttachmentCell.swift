//
//  AttachmentCell.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import SnapKit
import Then
import UIKit

class AttachmentCell: ChatBaseCell {
  // MARK: - UI Components

  private lazy var titleLabel = UILabel().then {
    $0.text = "Attachments"
    $0.font = .systemFont(ofSize: 14, weight: .semibold)
    $0.textColor = .systemPurple
  }

  private lazy var attachmentsStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 8
    $0.alignment = .fill
  }

  private lazy var mainStackView = UIStackView().then {
    $0.axis = .vertical
    $0.spacing = 12
    $0.alignment = .fill
  }

  // MARK: - Properties

  private var viewModel: AttachmentCellViewModel?

  // MARK: - Setup

  override func setupContentView() {
    containerView.addSubview(mainStackView)

    mainStackView.addArrangedSubview(titleLabel)
    mainStackView.addArrangedSubview(attachmentsStackView)

    mainStackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(contentInsets)
    }
  }

  // MARK: - Configuration

  override func configure(with viewModel: ChatCellViewModel) {
    guard let attachmentViewModel = viewModel as? AttachmentCellViewModel else { return }
    self.viewModel = attachmentViewModel

    configureContainer(backgroundColor: backgroundColor(for: attachmentViewModel.cellType))

    // 清除旧的附件视图
    attachmentsStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

    // 添加新的附件视图
    for attachment in attachmentViewModel.attachments {
      let attachmentView = createAttachmentView(for: attachment)
      attachmentsStackView.addArrangedSubview(attachmentView)
    }
  }

  // MARK: - Helpers

  private func createAttachmentView(for attachment: AttachmentViewModel) -> UIView {
    let containerView = UIView().then {
      $0.backgroundColor = .systemGray6
      $0.layer.cornerRadius = 8
      $0.layer.cornerCurve = .continuous
    }

    let iconView = UIImageView().then {
      $0.image = iconForMimeType(attachment.mimeType)
      $0.tintColor = .systemPurple
      $0.contentMode = .scaleAspectFit
    }

    let nameLabel = UILabel().then {
      $0.text = attachment.fileName ?? "Unknown File"
      $0.font = .systemFont(ofSize: 14, weight: .medium)
      $0.textColor = .label
      $0.numberOfLines = 1
    }

    let sizeLabel = UILabel().then {
      if let size = attachment.size {
        $0.text = formatFileSize(size)
      } else {
        $0.text = ""
      }
      $0.font = .systemFont(ofSize: 12)
      $0.textColor = .secondaryLabel
    }

    let stackView = UIStackView().then {
      $0.axis = .horizontal
      $0.spacing = 12
      $0.alignment = .center
    }

    let textStackView = UIStackView().then {
      $0.axis = .vertical
      $0.spacing = 2
      $0.alignment = .leading
    }

    containerView.addSubview(stackView)
    stackView.addArrangedSubview(iconView)
    stackView.addArrangedSubview(textStackView)
    stackView.addArrangedSubview(UIView()) // Spacer

    textStackView.addArrangedSubview(nameLabel)
    if !sizeLabel.text!.isEmpty {
      textStackView.addArrangedSubview(sizeLabel)
    }

    stackView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(12)
    }

    iconView.snp.makeConstraints { make in
      make.width.height.equalTo(32)
    }

    // 添加点击手势
    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(attachmentTapped(_:)))
    containerView.addGestureRecognizer(tapGesture)
    containerView.tag = attachment.hashValue

    return containerView
  }

  private func iconForMimeType(_ mimeType: String?) -> UIImage? {
    guard let mimeType else {
      return UIImage(systemName: "doc")
    }

    if mimeType.hasPrefix("image/") {
      return UIImage(systemName: "photo")
    } else if mimeType.hasPrefix("video/") {
      return UIImage(systemName: "video")
    } else if mimeType.hasPrefix("audio/") {
      return UIImage(systemName: "music.note")
    } else if mimeType.contains("pdf") {
      return UIImage(systemName: "doc.richtext")
    } else if mimeType.contains("text") {
      return UIImage(systemName: "doc.text")
    } else {
      return UIImage(systemName: "doc")
    }
  }

  private func formatFileSize(_ size: Int64) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .file
    return formatter.string(fromByteCount: size)
  }

  // MARK: - Actions

  @objc private func attachmentTapped(_ gesture: UITapGestureRecognizer) {
    guard let containerView = gesture.view,
          let attachment = viewModel?.attachments.first(where: { $0.hashValue == containerView.tag })
    else {
      return
    }

    // TODO: 实现附件打开逻辑
    print("Open attachment: \\(attachment.fileName ?? attachment.url)")
  }
}
