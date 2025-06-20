//
//  IntelligentsButton+Control.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import SnapKit
import UIKit

public extension UIViewController {
  @discardableResult
  func installIntelligentsButton() -> IntelligentsButton {
    print("[*] \(#function)")
    if let button = findIntelligentsButton() { return button }

    let button = IntelligentsButton()
    view.addSubview(button)
    view.bringSubviewToFront(button)
    button.snp.makeConstraints { make in
      make.trailing.equalTo(view.safeAreaLayoutGuide).offset(-20)
      make.bottom.equalTo(view.safeAreaLayoutGuide).offset(-20 - 44)
      make.width.height.equalTo(50)
    }
    button.transform = .init(scaleX: 0, y: 0)
    if view.frame != .zero {
      view.layoutIfNeeded()
    }
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

    performWithAnimation {
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
    performWithAnimation {
      button.alpha = 0
      button.transform = .init(scaleX: 0, y: 0)
      button.setNeedsLayout()
      self.view.layoutIfNeeded()
    } completion: { _ in
      button.isHidden = true
    }
  }
}
