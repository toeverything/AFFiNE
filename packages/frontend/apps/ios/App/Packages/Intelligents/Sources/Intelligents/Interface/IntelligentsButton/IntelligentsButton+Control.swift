//
//  IntelligentsButton+Control.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit

public extension UIViewController {
  @discardableResult
  func installIntelligentsButton() -> IntelligentsButton {
    print("[*] \(#function)")
    if let button = findIntelligentsButton() { return button }

    let button = IntelligentsButton()
    view.addSubview(button)
    view.bringSubviewToFront(button)
    button.translatesAutoresizingMaskIntoConstraints = false
    [
      button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20 - Constant.affineTabbarHeight),
      button.widthAnchor.constraint(equalToConstant: 50),
      button.heightAnchor.constraint(equalToConstant: 50),
    ].forEach { $0.isActive = true }
    button.transform = .init(scaleX: 0, y: 0)
    view.layoutIfNeeded()
    return button
  }

  private func findIntelligentsButton() -> IntelligentsButton? {
    for subview in view.subviews { // for for depth 1
      if let button = subview as? IntelligentsButton {
        return button
      }
    }
    return nil
  }

  func presentIntelligentsButton() {
    guard let button = findIntelligentsButton() else { return }
    print("[*] \(button) is calling \(#function)")

    button.alpha = 0
    button.isHidden = false
    button.setNeedsLayout()
    button.stopProgress()
    view.layoutIfNeeded()

    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) {
      button.alpha = 1
      button.transform = .identity
      button.setNeedsLayout()
      self.view.layoutIfNeeded()
    } completion: { _ in
      button.isUserInteractionEnabled = true
    }
  }

  func dismissIntelligentsButton(animated: Bool = true) {
    guard let button = findIntelligentsButton() else { return }
    print("[*] \(button) is calling \(#function)")

    button.isUserInteractionEnabled = false

    if !animated {
      button.stopProgress()
      button.isHidden = true
      return
    }

    button.stopProgress()
    button.setNeedsLayout()
    view.layoutIfNeeded()
    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) {
      button.alpha = 0
      button.transform = .init(scaleX: 0, y: 0)
      button.setNeedsLayout()
      self.view.layoutIfNeeded()
    } completion: { _ in
      button.isHidden = true
    }
  }
}
