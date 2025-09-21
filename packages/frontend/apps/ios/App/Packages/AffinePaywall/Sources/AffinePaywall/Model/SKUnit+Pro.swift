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
      pricing: [
        SKUnitPricingOption(
          price: "$7.99",
          description: "Monthly",
          isDefaultSelected: false,
          primaryTitle: "Upgrade for $7.99/month",
          secondaryTitle: ""
        ),
        SKUnitPricingOption(
          price: "$6.75",
          description: "Annual",
          badge: "Save 15%",
          isDefaultSelected: true,
          primaryTitle: "Upgrade for $6.75/month",
          secondaryTitle: ""
        ),
      ]
    ),
    SKUnit(
      category: SKUnitCategory.pro,
      subcategory: SKUnitSubcategoryProPlan.team,
      primaryText: "Pro team",
      secondaryText: "Best for scalable teams.",
      pricing: [
        SKUnitPricingOption(
          price: "$12",
          description: "Per seat monthly",
          isDefaultSelected: false,
          primaryTitle: "Upgrade for $12/month",
          secondaryTitle: ""
        ),
        SKUnitPricingOption(
          price: "$10",
          description: "Annual",
          badge: "Save 15%",
          isDefaultSelected: true,
          primaryTitle: "Upgrade for $10/month",
          secondaryTitle: ""
        ),
      ]
    ),
    SKUnit(
      category: SKUnitCategory.pro,
      subcategory: SKUnitSubcategoryProPlan.selfHost,
      primaryText: "Self Hosted team",
      secondaryText: "Best for scalable teams.",
      pricing: [
        SKUnitPricingOption(
          price: "$12",
          description: "Per seat monthly",
          isDefaultSelected: false,
          primaryTitle: "Upgrade for $12/month",
          secondaryTitle: ""
        ),
        SKUnitPricingOption(
          price: "$10",
          description: "Annual",
          badge: "Save 15%",
          isDefaultSelected: true,
          primaryTitle: "Upgrade for $10/month",
          secondaryTitle: ""
        ),
      ]
    ),
  ]
}
