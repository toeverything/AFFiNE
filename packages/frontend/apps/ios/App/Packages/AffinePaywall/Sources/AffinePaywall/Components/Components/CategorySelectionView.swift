//
//  CategorySelectionView.swift
//  AffinePaywall
//
//  Created by qaq on 9/17/25.
//

import AffineResources
import SwiftUI

struct CategorySelectionView: View {
  let selectedTab: SKUnitCategory
  let onSelect: (SKUnitCategory) -> Void

  var body: some View {
    HStack(spacing: 16) {
      ForEach(SKUnitCategory.allCases) { tab in
        TabItem(type: tab, isSelected: tab == selectedTab)
          .onTapGesture { onSelect(tab) }
      }
    }
    .animation(.spring.speed(2), value: selectedTab)
  }

  struct TabItem: View {
    let type: SKUnitCategory
    let isSelected: Bool

    var font: Font {
      if isSelected {
        .system(size: 24, weight: .bold)
      } else {
        .system(size: 24, weight: .regular)
      }
    }

    var color: Color {
      if isSelected {
        AffineColors.textPrimary.color
      } else {
        AffineColors.textSecondary.color
      }
    }

    var body: some View {
      Text(type.title)
        .lineLimit(1)
        .font(font)
        .foregroundStyle(color)
    }
  }
}

#Preview {
  struct PreviewWrapper: View {
    @State var selectedTab: SKUnitCategory = .pro
    var body: some View {
      CategorySelectionView(selectedTab: selectedTab, onSelect: { selectedTab = $0 })
    }
  }
  return VStack(alignment: .leading, spacing: 12) {
    CategorySelectionView(selectedTab: .pro, onSelect: { _ in })
    CategorySelectionView(selectedTab: .ai, onSelect: { _ in })
    Divider()
    PreviewWrapper()
  }
  .padding()
  .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
