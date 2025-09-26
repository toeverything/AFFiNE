//
//  ViewModel+Preview.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension ViewModel {
  static let vmPreviewForPro: ViewModel = {
    let vm = ViewModel()
    vm.select(category: .pro)
    vm.select(subcategory: SKUnitSubcategoryProPlan.default)
    return vm
  }()

  static let vmPreviewForAI: ViewModel = {
    let vm = ViewModel()
    vm.select(category: .ai)
    return vm
  }()
}
