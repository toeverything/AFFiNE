//
//  PurchaseFooterView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct PurchaseFooterView: View {
  @StateObject var viewModel: ViewModel

  var body: some View {
    VStack(spacing: 16) {
      if viewModel.availablePricingOptions.count > 1 {
        HStack(spacing: 8) {
          ForEach(viewModel.availablePricingOptions) { option in
            PricingOptionView(
              price: option.price,
              description: option.description,
              badge: option.badge ?? "",
              isSelected: option.id == viewModel.selectedPricingIdentifier
            ) {
              viewModel.select(pricingOption: option)
            }
          }
        }
      }

      TheGiveMeMoneyButtonView(
        primaryTitle: viewModel.selectedPricingOption.primaryTitle,
        secondaryTitle: viewModel.selectedPricingOption.secondaryTitle,
        callback: viewModel.purchase
      )

      Button(action: viewModel.restore) {
        Text("Restore Purchase")
      }
      .font(.system(size: 12))
      .buttonStyle(.plain)
      .foregroundStyle(AffineColors.textSecondary.color)
    }
  }
}

#Preview {
  PurchaseFooterView(viewModel: .init())
    .padding()
    .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
