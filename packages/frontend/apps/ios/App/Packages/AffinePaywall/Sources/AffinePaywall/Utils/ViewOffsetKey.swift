//
//  ViewOffsetKey.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import SwiftUI

@MainActor
struct ViewOffsetKey: @MainActor PreferenceKey {
  static var defaultValue: CGPoint = .zero
  static func reduce(value: inout CGPoint, nextValue: () -> CGPoint) {
    value = nextValue()
  }
}
