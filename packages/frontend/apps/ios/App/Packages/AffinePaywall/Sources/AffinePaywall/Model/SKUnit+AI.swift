//
//  SKUnit+AI.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension SKUnit {
  static let aiUnits: [SKUnit] = [
    SKUnit(
      category: SKUnitCategory.ai,
      primaryText: "AFFINE AI",
      secondaryText: "A true multimodal AI copilot.",
      pricing: [
        SKUnitPricingOption(
          price: "$8.9 per month",
          description: "",
          isDefaultSelected: true,
          primaryTitle: "$8.9 per month",
          secondaryTitle: "billed annually"
        ),
      ]
    ),
  ]
}
