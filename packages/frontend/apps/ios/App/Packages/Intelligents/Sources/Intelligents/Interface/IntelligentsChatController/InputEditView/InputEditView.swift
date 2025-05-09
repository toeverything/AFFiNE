//
//  InputEditView.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import Combine
import UIKit

class InputEditView: UIView {
  let mainStack = UIStackView()
  let attachmentsEditor = AttachmentBannerView()
  let textEditor = PlainTextEditView()
  let placeholderLabel = UILabel()
  let controlBanner = TextEditControlBanner()

  let viewModel = ViewModel()
  var placeholderText: String = "" {
    didSet {
      placeholderLabel.text = placeholderText
    }
  }

  var submitAction: (() -> Void) = {}

  init() {
    super.init(frame: .zero)

    addSubview(mainStack)
    mainStack.translatesAutoresizingMaskIntoConstraints = false
    mainStack.axis = .vertical
    mainStack.spacing = 16
    mainStack.alignment = .fill
    mainStack.distribution = .equalSpacing
    [
      mainStack.topAnchor.constraint(equalTo: topAnchor),
      mainStack.leadingAnchor.constraint(equalTo: leadingAnchor),
      mainStack.trailingAnchor.constraint(equalTo: trailingAnchor),
      mainStack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ].forEach { $0.isActive = true }

    textEditor.heightAnchor.constraint(greaterThanOrEqualToConstant: 64).isActive = true

    [
      attachmentsEditor, textEditor, controlBanner,
    ].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      mainStack.addArrangedSubview($0)
      [
        $0.leadingAnchor.constraint(equalTo: mainStack.leadingAnchor),
        $0.trailingAnchor.constraint(equalTo: mainStack.trailingAnchor),
      ].forEach { $0.isActive = true }
    }

    attachmentsEditor.readAttachments = { [weak self] in
      self?.viewModel.attachments ?? []
    }
    attachmentsEditor.onAttachmentsDelete = { [weak self] index in
      self?.viewModel.attachments.remove(at: index)
    }

    controlBanner.cameraButton.addTarget(
      self,
      action: #selector(takePhoto),
      for: .touchUpInside
    )
    controlBanner.photoButton.addTarget(
      self,
      action: #selector(selectPhoto),
      for: .touchUpInside
    )

    textEditor.returnKeyType = .send
    textEditor.addSubview(placeholderLabel)
    placeholderLabel.textColor = .label.withAlphaComponent(0.25)
    placeholderLabel.font = textEditor.font
    placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
    [
      placeholderLabel.leadingAnchor.constraint(equalTo: textEditor.leadingAnchor, constant: 2),
      placeholderLabel.trailingAnchor.constraint(equalTo: textEditor.trailingAnchor, constant: -2),
      placeholderLabel.topAnchor.constraint(equalTo: textEditor.topAnchor, constant: 0),
    ].forEach { $0.isActive = true }

    viewModel.objectWillChange
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        self?.updateValues()
      }
      .store(in: &viewModel.cancellables)

    updateValues()

    textEditor.textDidChange = { [weak self] text in
      self?.viewModel.text = text
      self?.updatePlaceholderVisibility()
    }

    textEditor.textDidReturn = { [weak self] in
      self?.submitAction()
    }
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func updatePlaceholderVisibility() {
    let visible = viewModel.text.isEmpty && !textEditor.isFirstResponder
    UIView.animate(withDuration: 0.25) {
      self.placeholderLabel.alpha = visible ? 1 : 0
    }
  }

  func updateValues() {
    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) { [self] in
      if textEditor.text != viewModel.text {
        textEditor.text = viewModel.text
      }
      attachmentsEditor.rebuildViews()
      parentViewController?.view.layoutIfNeeded()
      updatePlaceholderVisibility()
    }
  }
}
