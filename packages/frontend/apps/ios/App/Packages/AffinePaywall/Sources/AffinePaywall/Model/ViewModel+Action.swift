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

    assert(!operationInProgress)
    guard !operationInProgress else { return }
    print(#function, unit, option)

    Task.detached {
      await MainActor.run { self.operationInProgress = true }
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
        self.operationInProgress = false
        if shouldDismiss { self.dismiss() }
      }
    }
  }

  func restore() {
    let unit = selectedUnit
    let option = selectePackageOption

    assert(!operationInProgress)
    guard !operationInProgress else { return }
    print(#function, unit, option)

    Task.detached {
      await MainActor.run { self.operationInProgress = true }
      await self.store.restore() // TODO: populate items
      await MainActor.run { self.operationInProgress = false }
    }
  }

  func dismiss() {
    print(#function)
    associatedController?.dismiss(animated: true)
  }
}
