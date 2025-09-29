//
//  Store.swift
//  AffinePaywall
//
//  Created by qaq on 9/24/25.
//

import StoreKit

let store = Store.shared

final nonisolated class Store: ObservableObject, Sendable {
  static let shared = Store()

  private init() {}

  func fetchAppStoreContents() async throws {
    try await AppStore.sync()
  }

  func fetchProducts() async throws -> [Product] {
    let identifiers = SKUnit.allUnits
      .flatMap(\.package)
      .map(\.productIdentifier)
    print("fetching products for identifiers: \(identifiers)")
    #if DEBUG
      try await Task.sleep(for: .seconds(1)) // simulate network delay
    #endif
    let products = try await Product.products(
      for: identifiers.map { .init($0) }
    )
    if products.count != identifiers.count {
      throw NSError(domain: "AffinePaywall", code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(localized: "Failed to fetch all products from App Store."),
      ])
    }
    return products
  }

  func fetchEntitlements() async throws -> Set<String> {
    var purchasedItems: Set<String> = []

    for await result in Transaction.currentEntitlements {
      if case let .verified(transaction) = result {
        guard transaction.revocationDate == nil else { continue }

        switch transaction.productType {
        case .nonConsumable, .consumable:
          purchasedItems.insert(transaction.productID)
        case .autoRenewable, .nonRenewable:
          if let status = await transaction.subscriptionStatus,
             status.state == .subscribed
          { purchasedItems.insert(transaction.productID) }
        default:
          break
        }
      }
    }

    return purchasedItems
  }
}
