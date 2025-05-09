//
//  IntelligentsFocusApertureView+Layout.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/21.
//

import UIKit

extension IntelligentsFocusApertureView {
  func prepareFrameLayout() {
    guard let viewController = targetViewController,
          let view = viewController.view
    else {
      assertionFailure()
      return
    }
    let safeLayout = viewController.view.safeAreaLayoutGuide

    frameConstraints = [
      // use safe area to layout content views
      leadingAnchor.constraint(equalTo: safeLayout.leadingAnchor),
      trailingAnchor.constraint(equalTo: safeLayout.trailingAnchor),
      topAnchor.constraint(equalTo: safeLayout.topAnchor),
      bottomAnchor.constraint(equalTo: safeLayout.bottomAnchor),
      // cover all safe area so use constraints over view
      backgroundView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      backgroundView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      backgroundView.topAnchor.constraint(equalTo: view.topAnchor),
      backgroundView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ]
  }

  func prepareContentLayouts() {
    guard let targetView else {
      assertionFailure()
      return
    }

    contentBeginConstraints = [
      snapshotImageView.leftAnchor.constraint(equalTo: targetView.leftAnchor),
      snapshotImageView.rightAnchor.constraint(equalTo: targetView.rightAnchor),
      snapshotImageView.topAnchor.constraint(equalTo: targetView.topAnchor),
      snapshotImageView.bottomAnchor.constraint(equalTo: targetView.bottomAnchor),

      controlButtonsPanel.leftAnchor.constraint(equalTo: leftAnchor),
      controlButtonsPanel.rightAnchor.constraint(equalTo: rightAnchor),
      controlButtonsPanel.topAnchor.constraint(equalTo: bottomAnchor),
    ]

    let sharedInset: CGFloat = 32
    contentFinalConstraints = [
      snapshotImageView.leftAnchor.constraint(equalTo: leftAnchor, constant: sharedInset),
      snapshotImageView.rightAnchor.constraint(equalTo: rightAnchor, constant: -sharedInset),
      snapshotImageView.topAnchor.constraint(equalTo: topAnchor),
      snapshotImageView.bottomAnchor.constraint(equalTo: controlButtonsPanel.topAnchor, constant: -sharedInset / 2),

      controlButtonsPanel.leftAnchor.constraint(equalTo: leftAnchor, constant: sharedInset),
      controlButtonsPanel.rightAnchor.constraint(equalTo: rightAnchor, constant: -sharedInset),
      controlButtonsPanel.bottomAnchor.constraint(equalTo: bottomAnchor),
    ]
  }

  enum LayoutType {
    case begin
    case complete
  }

  func activateLayoutForAnimation(_ type: LayoutType) {
    NSLayoutConstraint.activate(frameConstraints)
    switch type {
    case .begin:
      NSLayoutConstraint.deactivate(contentFinalConstraints)
      NSLayoutConstraint.activate(contentBeginConstraints)

      snapshotImageView.layer.cornerRadius = 0
    case .complete:
      NSLayoutConstraint.deactivate(contentBeginConstraints)
      NSLayoutConstraint.activate(contentFinalConstraints)

      snapshotImageView.layer.cornerRadius = 32
    }
    let effectiveView = superview ?? self
    effectiveView.setNeedsUpdateConstraints()
    effectiveView.setNeedsLayout()
    updateConstraints()
    layoutIfNeeded()
  }
}
