//
//  SKUnitSubcategoryProPlan.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

enum SKUnitSubcategoryProPlan: String, SKUnitSubcategorizable {
  case `default`
  case team
  case selfHost

  var title: String {
    switch self {
    case .default: "Pro"
    case .team: "Pro team"
    case .selfHost: "Self Hosted"
    }
  }

  var description: String {
    switch self {
    case .default:
      "For family and small teams."
    case .team:
      "Best for scalable teams."
    case .selfHost:
      "Best for scalable teams."
    }
  }
}

extension SKUnitSubcategoryProPlan {
  var headerText: String {
    switch self {
    case .default:
      "Include in Pro"
    case .team:
      "Include in Team Workspace"
    case .selfHost:
      "Both in Teams & Enterprise"
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
    case .team:
      [
        Feature("Everything in AFFINE Pro", isHighlighted: true),
        Feature("100 GB initial storage + 20 GB per seat"),
        Feature("500 MB of maximum file size"),
        Feature("Unlimited team members (10+ seats)"),
        Feature("Multiple admin roles"),
        Feature("Priority customer support"),
      ]
    case .selfHost:
      [
        Feature("Everything in Self Hosted FOSS"),
        Feature("100 GB initial storage + 20 GB per seat"),
        Feature("500 MB of maximum file size"),
        Feature("Unlimited team members (10+ seats)"),
        Feature("Multiple admin roles"),
        Feature("Priority customer support"),
      ]
    }
  }
}
