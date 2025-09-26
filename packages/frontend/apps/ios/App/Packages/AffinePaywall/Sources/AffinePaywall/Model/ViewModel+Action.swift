//
//  ViewModel+Action.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation
import UIKit

extension ViewModel {
  func purchase() {
    let unit = selectedUnit
    let option = selectePackageOption

    assert(!updating)
    guard !updating else { return }
    print(#function, unit, option)

    Task.detached {
      await MainActor.run { self.updating = true }
      var shouldDismiss = false

      let product = await self.products.first {
        $0.id == option.productIdentifier
      }

      if let product {
        let result = try await product.purchase()
        switch result {
        case .pending:
          break
        case let .success(transaction):
          print("purchase success", transaction)
          shouldDismiss = true
        case .userCancelled:
          break
        @unknown default:
          assertionFailure()
        }
      } else { assertionFailure() } // should never happen

      await MainActor.run {
        self.updating = false
        if shouldDismiss { self.dismiss() }
      }
    }
  }

  func restore() {
    let unit = selectedUnit
    let option = selectePackageOption

    assert(!updating)
    guard !updating else { return }
    print(#function, unit, option)

    updateAppStoreStatus(initial: false)
  }

  func dismiss() {
    print(#function)
    associatedController?.dismiss(animated: true)
  }
}

nonisolated extension ViewModel {
  func updateAppStoreStatusExecute(initial: Bool) async {
    guard await !updating else { return }
    guard let controller = await associatedController else { return }
    await MainActor.run { self.updating = true }

    do {
      // before we continue, sync any changes from App Store
      // this will ask user to sign in if needed
      do {
        try await store.fetchAppStoreContents()
      } catch {
        // ignore user's cancellation on restore, not a huge deal
        print("updateAppStoreItems error:", error)
      }

      // now we fetch records from app store
      let products = try await store.fetchProducts()
      await MainActor.run { self.products = products }

      // fetch purchased items if signed in
      do {
        let purchase = try await store.fetchEntitlements()
        await MainActor.run { self.purchasedItems = purchase }
      } catch {
        print("fetchEntitlements error:", error)
        if !initial { throw error }
      }

      // select the package under purchased items if any
      let availablePackages = await availablePackageOptions
      let purchase = await purchasedItems
      let purchasedPackages = availablePackages.filter {
        purchase.contains($0.productIdentifier)
      }
      assert(purchasedPackages.count <= 1)
      if let firstPurchased = purchasedPackages.first {
        await MainActor.run {
          self.select(packageOption: firstPurchased)
        }
      }
    } catch {
      await MainActor.run {
        let alert = UIAlertController(
          title: String(localized: "Error"),
          message: error.localizedDescription,
          preferredStyle: .alert
        )
        alert.addAction(
          UIAlertAction(
            title: String(localized: "OK"),
            style: .default
          ) { [self] _ in dismiss() }
        )
        controller.present(alert, animated: true)
      }
    }

    await MainActor.run { self.updating = false }
  }
}
