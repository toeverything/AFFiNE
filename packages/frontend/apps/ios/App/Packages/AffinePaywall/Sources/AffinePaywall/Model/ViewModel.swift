//
//  ViewModel.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import SwiftUI

@MainActor
class ViewModel: ObservableObject {
  var availableUnits: [SKUnit] {
    SKUnit.units(for: category)
  }

  @Published private(set) var category: SKUnitCategory = .pro
  @Published private(set) var subcategory: any SKUnitSubcategorizable = SKUnitSubcategoryProPlan.default
  @Published private(set) var selectedPricingIdentifier: UUID = SKUnit.unit(
    for: .pro,
    subcategory: SKUnitSubcategoryProPlan.default
  )!.pricing.first { $0.isDefaultSelected }!.id

  init() {}

  func select(category: SKUnitCategory) {
    self.category = category
    let units = SKUnit.units(for: category)
    let subcategoryExists = units
      .contains { $0.subcategory.subcategoryIdentifier == subcategory.subcategoryIdentifier }
    if !subcategoryExists {
      subcategory = units.first!.subcategory
    }
    _ = selectedPricingOption // ensure selectedPricingIdentifier is valid
  }

  func select(subcategory: any SKUnitSubcategorizable) {
    let units = SKUnit.units(for: category)
    let subcategoryExists = units
      .contains { $0.subcategory.subcategoryIdentifier == subcategory.subcategoryIdentifier }
    if !subcategoryExists {
      let category = availableUnits
        .first { $0.subcategory.subcategoryIdentifier == subcategory.subcategoryIdentifier }!
        .category
      self.category = category
    } else {
      self.subcategory = subcategory
    }
    _ = selectedPricingOption // ensure selectedPricingIdentifier is valid
  }

  func select(pricingOption option: SKUnitPricingOption) {
    selectedPricingIdentifier = option.id

    let unit = availableUnits
      .first { unit in
        unit.pricing.contains { $0.id == option.id }
      }!
    category = unit.category
    subcategory = unit.subcategory

    _ = selectedPricingOption // ensure selectedPricingIdentifier is valid
  }
}

@MainActor
extension ViewModel {
  var selectedUnit: SKUnit {
    if let unit = SKUnit.unit(for: category, subcategory: subcategory) {
      return unit
    }
    let units = SKUnit.units(for: category)
    if let last = units.last {
      subcategory = last.subcategory
      return last
    }
    let item = availableUnits.first!
    category = item.category
    subcategory = item.subcategory
    return item
  }

  var selectedPricingOption: SKUnitPricingOption {
    let item = selectedUnit.pricing
      .first { $0.id == selectedPricingIdentifier }
    if let item { return item }
    let defaultItem = selectedUnit.pricing.first { $0.isDefaultSelected }
    if let defaultItem {
      selectedPricingIdentifier = defaultItem.id
      return defaultItem
    }
    let lastItem = selectedUnit.pricing.last!
    selectedPricingIdentifier = lastItem.id
    return lastItem
  }

  var availablePricingOptions: [SKUnitPricingOption] {
    selectedUnit.pricing
  }
}
