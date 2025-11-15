//
//  PackageOptionView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct PackageOptionView: View {
  let price: String
  let description: String
  var badge: String
  let isSelected: Bool
  let action: () -> Void

  init(
    price: String,
    description: String,
    badge: String = "",
    isSelected: Bool,
    action: @escaping () -> Void = {}
  ) {
    self.price = price
    self.description = description
    self.badge = badge
    self.isSelected = isSelected
    self.action = action
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(price)
            .contentTransition(.numericText())
            .font(.system(size: 20, weight: .bold))
            .lineLimit(1)
            .foregroundColor(isSelected ? AffineColors.buttonPrimary.color : AffineColors.textPrimary.color)
        }
        .layoutPriority(.infinity)
        Spacer(minLength: 0)
        if !badge.isEmpty {
          Text(badge)
            .contentTransition(.numericText())
            .font(.system(size: 10))
            .bold()
            .lineLimit(1)
            .foregroundColor(AffineColors.layerPureWhite.color)
            .padding(2)
            .padding(.horizontal, 2)
            .background(AffineColors.buttonPrimary.color)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
      }

      if !description.isEmpty {
        Text(description)
          .contentTransition(.numericText())
          .foregroundColor(isSelected ? AffineColors.buttonPrimary.color : AffineColors.textSecondary.color)
          .font(.system(size: 14))
      }
    }
    .animation(.interactiveSpring, value: price)
    .animation(.interactiveSpring, value: description)
    .animation(.interactiveSpring, value: badge)
    .padding(12)
    .frame(maxWidth: .infinity)
    .background {
      ZStack {
        Rectangle()
          .foregroundColor(AffineColors.layerBackgroundPrimary.color)
        if isSelected {
          Rectangle()
            .foregroundColor(AffineColors.buttonPrimary.color)
            .opacity(0.05)
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay {
      if isSelected {
        RoundedRectangle(cornerRadius: 8)
          .stroke(AffineColors.buttonPrimary.color, lineWidth: 1.5)
          .foregroundColor(.clear)
      } else {
        RoundedRectangle(cornerRadius: 8)
          .stroke(AffineColors.layerBorder.color.opacity(0.15), lineWidth: 1.5)
          .foregroundColor(.clear)
      }
    }
    .shadow(color: AffineColors.layerBorder.color.opacity(0.05), radius: 4, x: 0, y: 0)
    .animation(.interactiveSpring, value: isSelected)
    .contentShape(.rect)
    .onTapGesture {
      action()
    }
  }
}

#Preview {
  VStack(spacing: 16) {
    HStack(spacing: 16) {
      PackageOptionView(
        price: "$7.99",
        description: "Monthly",
        isSelected: false
      ) {}
      PackageOptionView(
        price: "$6.75",
        description: "Annually",
        badge: "Save 15%",
        isSelected: true
      ) {}
    }
    HStack(spacing: 16) {
      PackageOptionView(
        price: "$114514",
        description: "Monthly",
        badge: "Most Popular",
        isSelected: true
      ) {}
      PackageOptionView(
        price: "$6.75",
        description: "Annually",
        badge: "Save 15%",
        isSelected: false
      ) {}
    }
  }
  .padding(16)
  .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
