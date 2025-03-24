//
//  IntelligentsEphemeralActionController+ActionBar.swift
//  Intelligents
//
//  Created by 秋星桥 on 2025/1/15.
//

import UIKit

extension IntelligentsEphemeralActionController {
  class ActionBar: UIView {
    let retryButton = DarkActionButton()
    let continueToChat = DarkActionButton()
    let createNewDoc = DarkActionButton()

    init() {
      super.init(frame: .zero)
      defer { removeEveryAutoResizingMasks() }

      let contentSpacing: CGFloat = 16
      let buttonGroupHeight: CGFloat = 55

      let firstButtonSectionGroup = UIView()
      addSubview(firstButtonSectionGroup)
      [
        firstButtonSectionGroup.topAnchor.constraint(equalTo: topAnchor, constant: contentSpacing),
        firstButtonSectionGroup.leadingAnchor.constraint(equalTo: leadingAnchor),
        firstButtonSectionGroup.trailingAnchor.constraint(equalTo: trailingAnchor),
        firstButtonSectionGroup.heightAnchor.constraint(equalToConstant: buttonGroupHeight),
      ].forEach { $0.isActive = true }

      retryButton.title = NSLocalizedString("Retry", comment: "")
      retryButton.iconSystemName = "arrow.clockwise"
      continueToChat.title = NSLocalizedString("Continue to Chat", comment: "")
      continueToChat.iconSystemName = "paperplane"
      firstButtonSectionGroup.addSubview(retryButton)
      firstButtonSectionGroup.addSubview(continueToChat)
      [
        retryButton.topAnchor.constraint(equalTo: firstButtonSectionGroup.topAnchor),
        retryButton.leadingAnchor.constraint(equalTo: firstButtonSectionGroup.leadingAnchor),
        retryButton.bottomAnchor.constraint(equalTo: firstButtonSectionGroup.bottomAnchor),

        continueToChat.topAnchor.constraint(equalTo: firstButtonSectionGroup.topAnchor),
        continueToChat.trailingAnchor.constraint(equalTo: firstButtonSectionGroup.trailingAnchor),
        continueToChat.bottomAnchor.constraint(equalTo: firstButtonSectionGroup.bottomAnchor),

        retryButton.widthAnchor.constraint(equalTo: continueToChat.widthAnchor),
        retryButton.trailingAnchor.constraint(equalTo: continueToChat.leadingAnchor, constant: -contentSpacing),
      ].forEach { $0.isActive = true }

      let secondButtonSectionGroup = UIView()
      addSubview(secondButtonSectionGroup)
      [
        secondButtonSectionGroup.topAnchor.constraint(equalTo: firstButtonSectionGroup.bottomAnchor, constant: contentSpacing),
        secondButtonSectionGroup.leadingAnchor.constraint(equalTo: leadingAnchor),
        secondButtonSectionGroup.trailingAnchor.constraint(equalTo: trailingAnchor),
        secondButtonSectionGroup.heightAnchor.constraint(equalToConstant: buttonGroupHeight),
      ].forEach { $0.isActive = true }

      secondButtonSectionGroup.addSubview(createNewDoc)
      createNewDoc.title = NSLocalizedString("Create New Doc", comment: "")
      createNewDoc.iconSystemName = "doc.badge.plus"
      [
        createNewDoc.topAnchor.constraint(equalTo: secondButtonSectionGroup.topAnchor),
        createNewDoc.leadingAnchor.constraint(equalTo: secondButtonSectionGroup.leadingAnchor),
        createNewDoc.bottomAnchor.constraint(equalTo: secondButtonSectionGroup.bottomAnchor),
        createNewDoc.trailingAnchor.constraint(equalTo: secondButtonSectionGroup.trailingAnchor),
      ].forEach { $0.isActive = true }

      [
        secondButtonSectionGroup.bottomAnchor.constraint(equalTo: bottomAnchor),
      ].forEach { $0.isActive = true }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
      fatalError()
    }
  }
}
