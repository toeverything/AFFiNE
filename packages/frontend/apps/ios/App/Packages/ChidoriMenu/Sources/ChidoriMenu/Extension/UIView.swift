//
//  UIView.swift
//
//
//  Created by QAQ on 2023/9/16.
//

import UIKit

extension UIView {
  var parentViewController: UIViewController? {
    weak var parentResponder: UIResponder? = self
    while parentResponder != nil {
      parentResponder = parentResponder!.next
      if let viewController = parentResponder as? UIViewController {
        return viewController
      }
    }
    return nil
  }
}
