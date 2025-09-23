//
//  SKUnitCategory.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

enum SKUnitCategory: Int, CaseIterable, Equatable, Identifiable {
  var id: Int { rawValue }

  case pro
  case ai
}

extension SKUnitCategory {
  var title: String {
    switch self {
    case .pro: "AFFINE.Pro"
    case .ai: "AI"
    }
  }
}
