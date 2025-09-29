//
//  SKUnit+Pro.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension SKUnit {
  static let proUnits: [SKUnit] = [
    SKUnit(
      category: SKUnitCategory.pro,
      subcategory: SKUnitSubcategoryProPlan.default,
      primaryText: "Pro",
      secondaryText: "For family and small teams.",
      package: [
        SKUnitPackageOption(
          price: "...", // Will be populated from App Store
          description: PricingConfiguration.proMonthly.description,
          isDefaultSelected: PricingConfiguration.proMonthly.isDefaultSelected,
          primaryTitle: "...", // Will be populated from App Store
          secondaryTitle: "",
          productIdentifier: PricingConfiguration.proMonthly.productIdentifier,
          revenueCatIdentifier: PricingConfiguration.proMonthly.revenueCatIdentifier
        ),
        SKUnitPackageOption(
          price: "...", // Will be populated from App Store
          description: PricingConfiguration.proAnnual.description,
          badge: PricingConfiguration.proAnnual.badge,
          isDefaultSelected: PricingConfiguration.proAnnual.isDefaultSelected,
          primaryTitle: "...", // Will be populated from App Store
          secondaryTitle: "",
          productIdentifier: PricingConfiguration.proAnnual.productIdentifier,
          revenueCatIdentifier: PricingConfiguration.proAnnual.revenueCatIdentifier
        ),
      ]
    ),
  ]
}
