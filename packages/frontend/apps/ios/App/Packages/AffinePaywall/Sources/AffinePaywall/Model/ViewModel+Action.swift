//
//  ViewModel+Action.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension ViewModel {
  func purchase() {
    let unit = selectedUnit
    let option = selectedPricingOption

    print(#function, unit, option)
  }

  func restore() {
    let unit = selectedUnit
    let option = selectedPricingOption

    print(#function, unit, option)
  }

  func dismiss() {
    let unit = selectedUnit
    let option = selectedPricingOption

    print(#function, unit, option)
  }
}
