//
//  PageDotsView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct PageDotsView: View {
  let current: Int
  let total: Int

  let onSelection: (Int) -> Void

  var body: some View {
    HStack(spacing: 8) {
      ForEach(0 ..< total, id: \.self) { index in
        Circle()
          .foregroundStyle(
            index == current
              ? AffineColors.buttonPrimary.color
              : AffineColors.textSecondary.color.opacity(0.5)
          )
          .frame(width: 6, height: 6)
          .padding(4)
          .contentShape(Rectangle())
          .onTapGesture {
            onSelection(index)
          }
      }
    }
  }
}

#Preview {
  VStack(spacing: 32) {
    PageDotsView(current: 0, total: 8) { _ in }
    PageDotsView(current: 1, total: 8) { _ in }
    PageDotsView(current: 2, total: 8) { _ in }
    PageDotsView(current: 3, total: 8) { _ in }
    PageDotsView(current: 4, total: 8) { _ in }
    PageDotsView(current: 5, total: 8) { _ in }
    PageDotsView(current: 6, total: 8) { _ in }
    PageDotsView(current: 7, total: 8) { _ in }
    PageDotsView(current: 8, total: 8) { _ in }
  }
  .padding()
}
