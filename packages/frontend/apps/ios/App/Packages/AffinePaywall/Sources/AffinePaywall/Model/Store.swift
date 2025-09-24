//
//  Store.swift
//  AffinePaywall
//
//  Created by qaq on 9/24/25.
//

import StoreKit

final nonisolated class Store: ObservableObject, Sendable {
  init() {}

  func restore() async {
    try? await AppStore.sync()
  }

  typealias FetchProductCallback = @MainActor @Sendable (Result<[Product], Error>) -> Void
  func fetchProducts(_ completion: @escaping FetchProductCallback) {
    let identifiers = SKUnit.allUnits
      .flatMap(\.package)
      .map(\.productIdentifier)
    print("fetching products for identifiers: \(identifiers)")
    let callback = completion
    Task.detached {
      do {
        let products = try await Product.products(
          for: identifiers.map { .init($0) }
        )
        if products.count != identifiers.count {
          throw NSError(domain: "AffinePaywall", code: -1, userInfo: [
            NSLocalizedDescriptionKey: String(localized: "Failed to fetch all products from App Store."),
          ])
        }
        await MainActor.run { callback(.success(products)) }
      } catch {
        await MainActor.run { callback(.failure(error)) }
      }
    }
  }
}
