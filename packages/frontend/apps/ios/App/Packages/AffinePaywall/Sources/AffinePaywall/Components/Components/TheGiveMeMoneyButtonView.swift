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
  let callback: () -> Void

  init(
    primaryTitle: String = "",
    secondaryTitle: String = "",
    callback: @escaping () -> Void = {}
  ) {
    self.primaryTitle = primaryTitle
    self.secondaryTitle = secondaryTitle
    self.callback = callback
  }

  var body: some View {
    Button { callback() } label: {
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
    .animation(.spring, value: primaryTitle)
    .animation(.spring, value: secondaryTitle)
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .background(AffineColors.buttonPrimary.color)
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

// MARK: - Preview

#Preview {
  VStack(spacing: 16) {
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $6.75 per month",
      secondaryTitle: ""
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $10 per month",
      secondaryTitle: ""
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "$8.9 per month",
      secondaryTitle: "billed annually"
    )
    TheGiveMeMoneyButtonView(
      primaryTitle: "Upgrade for $499",
      secondaryTitle: ""
    )
  }
  .padding(32)
}
