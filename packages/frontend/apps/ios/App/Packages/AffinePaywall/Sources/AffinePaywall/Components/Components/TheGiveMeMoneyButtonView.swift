//
//  TheGiveMeMoneyButtonView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct TheGiveMeMoneyButtonView: View {
  let primaryTitle: String
  let secondaryTitle: String
  let isPurchased: Bool
  let callback: () -> Void

  init(
    primaryTitle: String = "",
    secondaryTitle: String = "",
    isPurchased: Bool,
    callback: @escaping () -> Void = {}
  ) {
    self.primaryTitle = primaryTitle
    self.secondaryTitle = secondaryTitle
    self.isPurchased = isPurchased
    self.callback = callback
  }

  var body: some View {
    Button { callback() } label: {
      if isPurchased {
        Image(systemName: "checkmark")
          .foregroundColor(AffineColors.layerPureWhite.color)
          .font(.system(size: 16, weight: .bold))
          .padding(12)
      } else {
        HStack(spacing: 4) {
          if !primaryTitle.isEmpty {
            Text(primaryTitle)
              .bold()
              .font(.system(size: 16))
              .contentTransition(.numericText())
          }
          if !secondaryTitle.isEmpty {
            Text("(\(secondaryTitle))")
              .font(.system(size: 12))
              .opacity(0.8)
              .contentTransition(.numericText())
          }
        }
        .foregroundColor(AffineColors.layerPureWhite.color)
        .padding(12)
      }
    }
    .animation(.spring, value: primaryTitle)
    .animation(.spring, value: secondaryTitle)
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .frame(minHeight: 32)
    .background(AffineColors.buttonPrimary.color)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .disabled(isPurchased)
  }
}

// MARK: - Preview

#Preview {
  VStack(spacing: 16) {
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $6.75 per month",
      secondaryTitle: "",
      isPurchased: false
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $10 per month",
      secondaryTitle: "",
      isPurchased: false
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "$8.9 per month",
      secondaryTitle: "billed annually",
      isPurchased: false
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $499",
      secondaryTitle: "",
      isPurchased: false
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $499",
      secondaryTitle: "",
      isPurchased: true
    )
  }
  .padding(32)
}
