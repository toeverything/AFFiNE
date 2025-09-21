//
//  SKUnitIntelligentDetailView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct SKUnitIntelligentDetailView: View {
  @StateObject var viewModel: ViewModel
  @State var detailIndex: Int = 0 {
    didSet { lastInteractionDate = Date() }
  }

  @State var lastInteractionDate: Date = .init()

  let timer = Timer
    .publish(every: 5, on: .main, in: .common)
    .autoconnect()

  var body: some View {
    VStack(spacing: 24) {
      HeadlineView(viewModel: viewModel)

      GeometryReader { r in
        let height = r.size.height
        let width = r.size.width
        ScrollViewReader { scrollView in
          ScrollView(.horizontal, showsIndicators: false) {
            GeometryReader { geometry in
              Color.clear
                .preference(
                  key: ViewOffsetKey.self,
                  value: geometry.frame(in: .named("scrollView")).origin
                )
            }
            .frame(width: 0, height: 0)
            HStack(spacing: 0) {
              ForEach(0 ..< Self.features.count, id: \.self) { featureIndex in
                let feature = Self.features[featureIndex]
                IntelligentFeatureView(feature: feature)
                  .padding()
                  .frame(width: width, height: height)
                  .id(featureIndex)
              }
            }
          }
          .coordinateSpace(name: "scrollView")
          .onPreferenceChange(ViewOffsetKey.self) { newValue in
            let page = Int(round(-newValue.x / width))
            guard page != detailIndex else { return }
            guard page >= 0, page < Self.features.count else { return }
            detailIndex = page
          }
          .frame(height: height)
          .onChange(of: detailIndex) { newValue in
            withAnimation(.spring) {
              scrollView.scrollTo(newValue)
            }
          }
        }
      }

      PageDotsView(
        current: detailIndex,
        total: Self.features.count
      ) { index in
        detailIndex = index
      }
    }
    .onReceive(timer) { _ in
      if Date().timeIntervalSince(lastInteractionDate) > 5 {
        detailIndex = (detailIndex + 1) % Self.features.count
      }
    }
  }
}

#Preview {
  SKUnitIntelligentDetailView(viewModel: .vmPreviewForAI)
    .padding()
}
