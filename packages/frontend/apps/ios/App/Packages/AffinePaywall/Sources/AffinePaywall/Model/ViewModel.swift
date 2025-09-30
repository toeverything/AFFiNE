//
//  ViewModel.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import StoreKit
import SwiftUI
import WebKit

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

  @Published var updating = false
  @Published var products: [Product] = []
  @Published var storePurchasedItems: Set<String> = []
  @Published var externalPurchasedItems: Set<String> = []
  @Published var packageOptions: [SKUnitPackageOption] = SKUnit.allUnits.flatMap(\.package)

  var purchasedItems: Set<String> {
    Set<String>()
      .union(storePurchasedItems)
      .union(externalPurchasedItems)
  }

  private(set) weak var associatedController: UIViewController?
  private(set) weak var associatedWebContext: WKWebView?

  init() {
    updateAppStoreStatus(initial: true)
  }

  func updateAppStoreStatus(initial: Bool) {
    Task.detached {
      await self.updateAppStoreStatusExecute(initial: initial)
    }
  }

  func bind(controller: UIViewController) {
    associatedController = controller
  }

  func bind(context: WKWebView) {
    associatedWebContext = context
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

  func updatePackageOptions(with products: [Product]) {
    var updatedOptions = packageOptions

    for (index, option) in updatedOptions.enumerated() {
      if let product = products.first(where: { $0.id == option.productIdentifier }) {
        let price = product.displayPrice
        let description = product.description

        let (purchasePrimaryTitle, purchaseSecondaryTitle) = purchaseButtonText(
          for: product,
          option: option
        )

        updatedOptions[index] = SKUnitPackageOption(
          id: option.id,
          price: price,
          description: option.description.isEmpty ? description : option.description,
          badge: option.badge,
          isDefaultSelected: option.isDefaultSelected,
          primaryTitle: purchasePrimaryTitle,
          secondaryTitle: purchaseSecondaryTitle,
          productIdentifier: option.productIdentifier,
          revenueCatIdentifier: option.revenueCatIdentifier
        )
      }
    }

    packageOptions = updatedOptions
  }

  private func purchaseButtonText(for product: Product, option: SKUnitPackageOption) -> (String, String) {
    let monthlyPrice = calculateMonthlyPrice(for: product, option: option)

    if option.productIdentifier.contains(".ai.") {
      return ("\(monthlyPrice) per month", "billed annually")
    } else {
      return ("Upgrade for \(monthlyPrice) per month", "")
    }
  }

  private func calculateMonthlyPrice(for product: Product, option _: SKUnitPackageOption) -> String {
    guard let subscription = product.subscription else {
      preconditionFailure("Product must have subscription information")
    }

    switch subscription.subscriptionPeriod.unit {
    case .year:
      let yearlyPrice = product.price
      let monthlyPrice = yearlyPrice / 12.0

      // Round up to ensure total price is slightly lower than yearly price
      var roundedMonthlyPrice = monthlyPrice
      var rounded = Decimal()
      NSDecimalRound(&rounded, &roundedMonthlyPrice, 2, .up)

      let formatter = NumberFormatter()
      formatter.numberStyle = .currency
      formatter.currencyCode = product.priceFormatStyle.currencyCode
      formatter.minimumFractionDigits = 2
      formatter.maximumFractionDigits = 2

      if let formattedMonthlyPrice = formatter.string(from: NSDecimalNumber(decimal: rounded)) {
        return formattedMonthlyPrice
      }

    case .month:
      return product.displayPrice

    case .week, .day:
      preconditionFailure("Unsupported subscription period: \(subscription.subscriptionPeriod.unit)")

    @unknown default:
      preconditionFailure("Unknown subscription period")
    }

    return product.displayPrice
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
    let unitPackageIds = selectedUnit.package.map(\.id)
    let item = packageOptions
      .first { $0.id == selectedPackageIdentifier && unitPackageIds.contains($0.id) }
    if let item { return item }
    let defaultItem = packageOptions
      .first { $0.isDefaultSelected && unitPackageIds.contains($0.id) }
    if let defaultItem {
      selectedPackageIdentifier = defaultItem.id
      return defaultItem
    }
    let lastItem = packageOptions
      .first { unitPackageIds.contains($0.id) }!
    selectedPackageIdentifier = lastItem.id
    return lastItem
  }

  var availablePackageOptions: [SKUnitPackageOption] {
    let unitPackageIds = selectedUnit.package.map(\.id)
    return packageOptions.filter { unitPackageIds.contains($0.id) }
  }
}
