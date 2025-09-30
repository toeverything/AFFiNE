//
//  PositionObservingView.swift
//  AffinePaywall
//
//  Created by qaq on 9/23/25.
//

import SwiftUI

struct PositionObservingView<Content: View>: View {
  var coordinateSpace: CoordinateSpace
  @Binding var position: CGPoint
  @ViewBuilder var content: () -> Content

  var body: some View {
    content()
      .background(GeometryReader { geometry in
        Color.clear.preference(
          key: PreferenceKey.self,
          value: geometry.frame(in: coordinateSpace).origin
        )
      })
      .onPreferenceChange(PreferenceKey.self) { position in
        self.position = position
      }
  }
}

private extension PositionObservingView {
  struct PreferenceKey: SwiftUI.PreferenceKey {
    static var defaultValue: CGPoint { .zero }

    static func reduce(value _: inout CGPoint, nextValue _: () -> CGPoint) {
      // No-op
    }
  }
}
