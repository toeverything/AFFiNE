//
//  SKUnitPricingOption.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

struct SKUnitPricingOption: Identifiable, Equatable {
  var id: UUID

  // pricing selection button
  var price: String
  var description: String
  var badge: String?
  var isDefaultSelected: Bool

  // subscribe button titles
  var primaryTitle: String
  var secondaryTitle: String

  init(
    id: UUID = UUID(),
    price: String,
    description: String,
    badge: String? = nil,
    isDefaultSelected: Bool = false,
    primaryTitle: String,
    secondaryTitle: String
  ) {
    self.id = id
    self.price = price
    self.description = description
    self.badge = badge
    self.isDefaultSelected = isDefaultSelected
    self.primaryTitle = primaryTitle
    self.secondaryTitle = secondaryTitle
  }
}
