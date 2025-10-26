//
//  SKUnitSubcategoryProPlan.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

enum SKUnitSubcategoryProPlan: String, SKUnitSubcategorizable {
  case `default`

  var title: String {
    switch self {
    case .default: "Pro"
    }
  }

  var description: String {
    switch self {
    case .default:
      "For family and small teams."
    }
  }
}

extension SKUnitSubcategoryProPlan {
  var headerText: String {
    switch self {
    case .default:
      "Include in Pro"
    }
  }

  var features: [Feature] {
    switch self {
    case .default:
      [
        Feature("Everything in AFFINE FOSS & Basic."),
        Feature("100 GB of Cloud Storage"),
        Feature("100 MB of Maximum file size"),
        Feature("Up to 10 members per Workspace"),
        Feature("30-days Cloud Time Machine file version history"),
        Feature("Community Support"),
        Feature("Real-time Syncing & Collaboration for more people"),
      ]
    }
  }
}
