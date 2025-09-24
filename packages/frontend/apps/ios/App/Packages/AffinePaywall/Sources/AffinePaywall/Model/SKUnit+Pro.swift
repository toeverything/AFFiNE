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
          price: "$7.99",
          description: "Monthly",
          isDefaultSelected: false,
          primaryTitle: "Upgrade for $7.99/month",
          secondaryTitle: "",
          productIdentifier: "app.affine.pro.Monthly",
          revenueCatIdentifier: "app.affine.pro.Monthly"
        ),
        SKUnitPackageOption(
          price: "$6.75",
          description: "Annual",
          badge: "Save 15%",
          isDefaultSelected: true,
          primaryTitle: "Upgrade for $6.75/month",
          secondaryTitle: "",
          productIdentifier: "app.affine.pro.Annual",
          revenueCatIdentifier: "app.affine.pro.Annual"
        ),
      ]
    ),
  ]
}
