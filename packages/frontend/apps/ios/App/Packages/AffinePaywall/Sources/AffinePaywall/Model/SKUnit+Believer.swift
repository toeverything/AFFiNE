//
//  SKUnit+Believer.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension SKUnit {
  static let believerUnits: [SKUnit] = [
    SKUnit(
      category: SKUnitCategory.believer,
      primaryText: "Believer Plan",
      secondaryText: "AFFINE's Everything",
      pricing: [
        SKUnitPricingOption(
          price: "$499",
          description: "",
          isDefaultSelected: true,
          primaryTitle: "Upgrade for $499",
          secondaryTitle: ""
        ),
      ]
    ),
  ]
}
