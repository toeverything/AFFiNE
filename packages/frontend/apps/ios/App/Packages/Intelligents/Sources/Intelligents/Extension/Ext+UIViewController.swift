//
//  Ext+UIViewController.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit

public extension UIViewController {
  func presentIntoCurrentContext(withTargetController targetController: UIViewController, animated: Bool = true) {
    if let nav = self as? UINavigationController {
      nav.pushViewController(targetController, animated: animated)
    } else if let nav = navigationController {
      nav.pushViewController(targetController, animated: animated)
    } else {
      present(targetController, animated: animated, completion: nil)
    }
  }

  func dismissInContext() {
    if let nav = navigationController {
      nav.popViewController(animated: true)
    } else {
      dismiss(animated: true, completion: nil)
    }
  }

  func hideKeyboardWhenTappedAround() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(UIViewController.dismissKeyboard))
    tap.cancelsTouchesInView = false
    view.addGestureRecognizer(tap)
  }

  @objc func dismissKeyboard() {
    view.endEditing(true)
  }

  func presentError(_ error: Error, onDismiss: @escaping () -> Void = {}) {
    DispatchQueue.main.async { [self] in
      let alert = UIAlertController(
        title: "Error".localized(),
        message: error.localizedDescription,
        preferredStyle: .alert
      )
      alert.addAction(UIAlertAction(title: "OK".localized(), style: .default) { _ in
        onDismiss()
      })
      present(alert, animated: true)
    }
  }
}
