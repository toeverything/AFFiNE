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
      }
      if shouldDismiss {
        await MainActor.run {
          self.dismiss()
        }
      }
    }
  }

  func restore() {
    let unit = selectedUnit
    let option = selectePackageOption

    assert(!updating)
    guard !updating else { return }
    print(#function, unit, option)

    Task.detached {
      // before we continue, sync any changes from App Store
      // this will ask user to sign in if needed
      do {
        try await store.fetchAppStoreContents()
      } catch {
        // ignore user's cancellation on restore, not a huge deal
        print("updateAppStoreItems error:", error)
      }

      await MainActor.run { self.updateAppStoreStatus(initial: false) }
    }
  }

  func dismiss() {
    print(#function)

    if let context = associatedWebContext {
      Task.detached {
        do {
          _ = try await context.callAsyncJavaScript(
            "return await window.updateSubscriptionState();",
            contentWorld: .page
          )
          print("updateSubscriptionState success")
        } catch {
          print("updateSubscriptionState error:", error.localizedDescription)
        }
      }
    }

    associatedController?.dismiss(animated: true)
  }
}

nonisolated extension ViewModel {
  func updateAppStoreStatusExecute(initial: Bool) async {
    guard await !updating else { return }
    guard let controller = await associatedController else { return }
    await MainActor.run { self.updating = true }

    do {
      // now we fetch records from app store
      let products = try await store.fetchProducts()
      await MainActor.run {
        self.products = products
        self.updatePackageOptions(with: products)
      }

      // fetch purchased items if signed in
      do {
        let purchase = try await store.fetchEntitlements()
        await MainActor.run { self.storePurchasedItems = purchase }
      } catch {
        print("fetchEntitlements error:", error)
        if !initial { throw error }
      }

      // fetch external items by executing on webview's JS context
      do {
        guard let webView = await associatedWebContext else {
          throw NSError(domain: "Paywall", code: -1, userInfo: [
            NSLocalizedDescriptionKey: String(localized: "Missing required information"),
          ])
        }
        let result = try await webView.callAsyncJavaScript(
          "return await window.getSubscriptionState();",
          contentWorld: .page
        )
        let purchased = decodeWebContextSubscriptionInformation(result)
        print("fetched external purchased items:", purchased)
        await MainActor.run { self.externalPurchasedItems = purchased }
      } catch {
        print("fetchExternalEntitlements error:", error.localizedDescription)
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

  nonisolated func decodeWebContextSubscriptionInformation(_ input: Any?) -> Set<String> {
    var ans: Set<String> = []

    guard let dict = input as? [String: Any] else {
      assertionFailure()
      return ans
    }

    let pro = dict["pro"] as? [String: Any]
    let ai = dict["ai"] as? [String: Any]

    if let proPlan = pro?["recurring"] as? String {
      switch proPlan.lowercased() {
      case "lifetime":
        // user actually purchased believer plan
        // but we map it to yearly plan just for easier handling
        // do not purchase any of this plan if already purchased
        ans.insert(PricingConfiguration.proAnnual.productIdentifier)
      case "monthly":
        ans.insert(PricingConfiguration.proMonthly.productIdentifier)
      case "yearly":
        ans.insert(PricingConfiguration.proAnnual.productIdentifier)
      default:
        ans.insert(PricingConfiguration.proAnnual.productIdentifier) // block payment
        assertionFailure()
      }
    }
    if let aiPlan = ai?["recurring"] as? String {
      switch aiPlan.lowercased() {
      case "yearly":
        ans.insert(PricingConfiguration.aiAnnual.productIdentifier)
      default:
        // ai plan can only be purchased as yearly plan
        ans.insert(PricingConfiguration.aiAnnual.productIdentifier) // block payment
        assertionFailure()
      }
    }

    return ans
  }
}
