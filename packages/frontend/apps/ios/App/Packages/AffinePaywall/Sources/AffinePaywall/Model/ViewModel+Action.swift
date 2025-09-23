//
//  ViewModel+Action.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation
import UIKit

extension ViewModel {
  func purchase() {
    let unit = selectedUnit
    let option = selectedPricingOption

    print(#function, unit, option)

    #if DEBUG
      let alert = UIAlertController(
        title: "Purchase",
        message: "You have selected \(unit.primaryText) - \(option.price).",
        preferredStyle: .alert
      )
      alert.addAction(.init(title: "OK", style: .default))
      associatedController?.present(alert, animated: true)
    #endif
  }

  func restore() {
    let unit = selectedUnit
    let option = selectedPricingOption

    print(#function, unit, option)

    #if DEBUG
      let alert = UIAlertController(
        title: "Restore",
        message: "You have selected \(unit.primaryText) - \(option.price).",
        preferredStyle: .alert
      )
      alert.addAction(.init(title: "OK", style: .default))
      associatedController?.present(alert, animated: true)
    #endif
  }

  func dismiss() {
    print(#function)
    associatedController?.dismiss(animated: true)
  }
}
