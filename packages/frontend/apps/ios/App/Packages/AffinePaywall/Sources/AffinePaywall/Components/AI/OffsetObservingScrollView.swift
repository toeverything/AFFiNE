//
//  OffsetObservingScrollView.swift
//  AffinePaywall
//
//  Created by qaq on 9/23/25.
//

import SwiftUI

struct OffsetObservingScrollView<Content: View>: View {
  var axes: Axis.Set = [.vertical]
  var showsIndicators = true
  @Binding var offset: CGPoint
  @ViewBuilder var content: () -> Content

  private let coordinateSpaceName = UUID()

  var body: some View {
    ScrollView(axes, showsIndicators: showsIndicators) {
      PositionObservingView(
        coordinateSpace: .named(coordinateSpaceName),
        position: Binding(
          get: { offset },
          set: { newOffset in
            offset = CGPoint(
              x: -newOffset.x,
              y: -newOffset.y
            )
          }
        ),
        content: content
      )
    }
    .coordinateSpace(name: coordinateSpaceName)
  }
}
