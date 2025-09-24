//
//  ViewModel.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import StoreKit
import SwiftUI

@MainActor
class ViewModel: ObservableObject {
  var availableUnits: [SKUnit] {
    SKUnit.units(for: category)
  }

  @Published private(set) var category: SKUnitCategory = .pro
  @Published private(set) var subcategory: any SKUnitSubcategorizable = SKUnitSubcategoryProPlan.default
  @Published private(set) var selectedPackageIdentifier: UUID = SKUnit.unit(
    for: .pro,
    subcategory: SKUnitSubcategoryProPlan.default
  )!.package.first { $0.isDefaultSelected }!.id

  @Published private(set) var products: [Product] = []
  @Published private(set) var productsUpdatingError: Error?
  @Published var operationInProgress = false

  private(set) weak var associatedController: UIViewController?

  let store = Store()

  init() {
    store.fetchProducts { result in // will called from MainActor
      switch result {
      case let .success(products):
        self.products = products
        print("fetched products: \(products.map(\.id))")
      case let .failure(error):
        self.productsUpdatingError = error
        print("failed to fetch products: \(error)")
      }
    }
  }

  func bind(controller: UIViewController) {
    associatedController = controller
  }

  func select(category: SKUnitCategory) {
    self.category = category
    let units = SKUnit.units(for: category)
    let subcategoryExists = units
      .contains { $0.subcategory.subcategoryIdentifier == subcategory.subcategoryIdentifier }
    if !subcategoryExists {
      subcategory = units.first!.subcategory
    }
    _ = selectePackageOption // ensure selectePackageOption is valid
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
    _ = selectePackageOption // ensure selectePackageOption is valid
  }

  func select(packageOption option: SKUnitPackageOption) {
    selectedPackageIdentifier = option.id

    let unit = availableUnits
      .first { unit in
        unit.package.contains { $0.id == option.id }
      }!
    category = unit.category
    subcategory = unit.subcategory

    _ = selectePackageOption // ensure selectePackageOption is valid
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

  var selectePackageOption: SKUnitPackageOption {
    let item = selectedUnit.package
      .first { $0.id == selectedPackageIdentifier }
    if let item { return item }
    let defaultItem = selectedUnit.package.first { $0.isDefaultSelected }
    if let defaultItem {
      selectedPackageIdentifier = defaultItem.id
      return defaultItem
    }
    let lastItem = selectedUnit.package.last!
    selectedPackageIdentifier = lastItem.id
    return lastItem
  }

  var availablePackageOptions: [SKUnitPackageOption] {
    selectedUnit.package
  }
}
