//
//  SKUnitSubcategorizable.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

protocol SKUnitSubcategorizable: Identifiable, Equatable, Hashable, CaseIterable, Sendable {
  var id: String { get }
  var subcategoryIdentifier: String { get }
}

extension SKUnitSubcategorizable {
  var id: String {
    subcategoryIdentifier
  }
}

extension SKUnitSubcategorizable where Self: RawRepresentable, Self.RawValue == String {
  var subcategoryIdentifier: String { rawValue }
}

enum SKUnitSingleSubcategory: String, SKUnitSubcategorizable {
  case single
}
