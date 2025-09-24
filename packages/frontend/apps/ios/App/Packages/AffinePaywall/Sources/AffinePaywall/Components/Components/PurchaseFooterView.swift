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

  var isFetchingProducts: Bool {
    //
    // This logic might seem confusing, but we treat a product update error the same as a fetching state.
    // An alert will appear if an error occurs, and tapping OK will dismiss the entire paywall.
    //
    // Considering that, we simplify the logic here:
    //
    // -> if an error occurs, we keep the button disabled.
    //
    if viewModel.products.isEmpty { return true }
    if viewModel.productsUpdatingError != nil { return true }
    if viewModel.operationInProgress { return true }
    return false
  }

  @State var presentErrorAlert: Bool = false
  @State var presentedError: LocalizedError? = nil

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
      }

      if isFetchingProducts {
        TheGiveMeMoneyButtonView(
          primaryTitle: "Height Placeholder",
          secondaryTitle: ""
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
          callback: viewModel.purchase
        )
        .transition(.opacity)
      }

      Button(action: viewModel.restore) {
        Text("Restore Purchase")
      }
      .font(.system(size: 12))
      .buttonStyle(.plain)
      .foregroundStyle(AffineColors.textSecondary.color)
      .opacity(viewModel.products.isEmpty ? 0 : 1)
    }
    .alert(isPresented: .init(
      get: { viewModel.productsUpdatingError != nil },
      set: { _ in }
    )) {
      Alert(
        title: Text("Error"),
        message: Text(viewModel.productsUpdatingError?.localizedDescription ?? "Unknown error"),
        dismissButton: .default(Text("OK")) {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            viewModel.dismiss()
          }
        }
      )
    }
    .animation(.spring, value: isFetchingProducts)
  }
}

#Preview {
  PurchaseFooterView(viewModel: .init())
    .padding()
    .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
