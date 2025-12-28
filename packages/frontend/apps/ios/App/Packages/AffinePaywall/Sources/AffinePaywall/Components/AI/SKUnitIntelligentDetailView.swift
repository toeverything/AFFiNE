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

  @State var detailIndexInSwitching: UUID? = nil
  @State var detailIndex: Int = 0 {
    didSet { lastInteractionDate = Date() }
  }

  @State var lastInteractionDate: Date = .init()
  @State var scrollOffset: CGPoint = .zero

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
          OffsetObservingScrollView(
            axes: .horizontal,
            showsIndicators: false,
            offset: $scrollOffset
          ) {
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
          .frame(height: height)
          .onChange(of: detailIndex) { newValue in
            withAnimation(.spring) {
              scrollView.scrollTo(newValue)
            }
          }
        }
        .onChange(of: scrollOffset) { _ in
          guard detailIndexInSwitching == nil else { return }
          guard width > 0 else { return }
          let offset = scrollOffset.x
          let newIndex = Int((offset + width / 2) / width)
          if newIndex != detailIndex,
             (0 ..< Self.features.count).contains(newIndex)
          { detailIndex = newIndex }
        }
      }

      PageDotsView(
        current: detailIndex,
        total: Self.features.count
      ) { index in
        detailIndex = index
        let token = UUID()
        detailIndexInSwitching = token
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          guard detailIndexInSwitching == token else { return }
          detailIndexInSwitching = nil
        }
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
