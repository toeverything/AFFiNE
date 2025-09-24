//
//  SKUnit.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

struct SKUnit: Identifiable, Sendable {
  let id = UUID()
  let category: SKUnitCategory
  let subcategory: any SKUnitSubcategorizable
  let primaryText: String
  let secondaryText: String
  let package: [SKUnitPackageOption]

  init(
    category: SKUnitCategory,
    subcategory: (any SKUnitSubcategorizable) = SKUnitSingleSubcategory.single,
    primaryText: String,
    secondaryText: String,
    package: [SKUnitPackageOption]
  ) {
    self.category = category
    self.subcategory = subcategory
    self.primaryText = primaryText
    self.secondaryText = secondaryText
    self.package = package
  }
}

extension SKUnit {
  static let allUnits: [SKUnit] = [
    proUnits,
    aiUnits,
  ].flatMap(\.self)

  static func units(for category: SKUnitCategory) -> [SKUnit] {
    allUnits.filter { $0.category == category }
  }

  static func unit(
    for type: SKUnitCategory,
    subcategory: (any SKUnitSubcategorizable) = SKUnitSingleSubcategory.single
  ) -> SKUnit? {
    let subcategory = subcategory.subcategoryIdentifier
    let item = allUnits
      .filter { $0.category == type }
      .filter { $0.subcategory.subcategoryIdentifier == subcategory }
    assert(item.count == 1)
    return item.first
  }
}
