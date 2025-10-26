//
//  SKUnitPackageOption.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

struct SKUnitPackageOption: Identifiable, Equatable {
  var id: UUID

  // package selection button
  var price: String
  var description: String
  var badge: String?
  var isDefaultSelected: Bool

  // subscribe button titles
  var primaryTitle: String
  var secondaryTitle: String

  // product identifiers
  var productIdentifier: String
  var revenueCatIdentifier: String

  init(
    id: UUID = UUID(),
    price: String,
    description: String,
    badge: String? = nil,
    isDefaultSelected: Bool = false,
    primaryTitle: String,
    secondaryTitle: String,
    productIdentifier: String,
    revenueCatIdentifier: String
  ) {
    self.id = id
    self.price = price
    self.description = description
    self.badge = badge
    self.isDefaultSelected = isDefaultSelected
    self.primaryTitle = primaryTitle
    self.secondaryTitle = secondaryTitle
    self.productIdentifier = productIdentifier
    self.revenueCatIdentifier = revenueCatIdentifier
  }
}
