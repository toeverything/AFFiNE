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

  var isPurchased: Bool {
    let package = viewModel.selectePackageOption
    return viewModel.purchasedItems.contains(package.productIdentifier)
  }

  var body: some View {
    VStack(spacing: 16) {
      if viewModel.availablePackageOptions.count > 1 {
        HStack(spacing: 8) {
          ForEach(viewModel.availablePackageOptions) { option in
            PackageOptionView(
              price: option.price,
              description: option.description,
              badge: option.badge ?? "",
              isSelected: option.id == viewModel.selectedPackageIdentifier
            ) {
              viewModel.select(packageOption: option)
            }
          }
        }
        .disabled(isPurchased)
      }

      if viewModel.updating {
        TheGiveMeMoneyButtonView(
          primaryTitle: "Height Placeholder",
          secondaryTitle: "",
          isPurchased: false
        ) {}
          .hidden()
          .background(AffineColors.buttonPrimary.color)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay {
            ProgressView()
              .progressViewStyle(.circular)
          }
          .transition(.opacity)
      } else {
        TheGiveMeMoneyButtonView(
          primaryTitle: viewModel.selectePackageOption.primaryTitle,
          secondaryTitle: viewModel.selectePackageOption.secondaryTitle,
          isPurchased: isPurchased,
          callback: viewModel.purchase
        )
        .transition(.opacity)
      }

      Button(action: viewModel.restore) {
        if isPurchased {
          Text("Already Purchased")
        } else {
          Text("Restore Purchase")
            .underline()
        }
      }
      .font(.system(size: 12))
      .buttonStyle(.plain)
      .foregroundStyle(AffineColors.textSecondary.color)
      .opacity(viewModel.products.isEmpty ? 0 : 1)
      .disabled(isPurchased)
      .disabled(viewModel.updating)

      Text("The Monthly and Annual plans renew automatically, but you’re free to cancel at any time if it’s not right for you.")
        .font(.system(size: 12))
        .foregroundStyle(AffineColors.textSecondary.color)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }
    .animation(.spring, value: viewModel.updating)
  }
}

#Preview {
  PurchaseFooterView(viewModel: .init())
    .padding()
    .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
