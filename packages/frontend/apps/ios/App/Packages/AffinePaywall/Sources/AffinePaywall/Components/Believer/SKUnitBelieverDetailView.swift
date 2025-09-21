//
//  SKUnitBelieverDetailView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import SwiftUI

struct SKUnitBelieverDetailView: View {
  @StateObject var viewModel: ViewModel

  let features: [Feature] = [
    .init("Everything in AFFiNE Pro"),
    .init("Life-time Personal usage"),
    .init("1TB Cloud Storage"),
  ]

  var body: some View {
    VStack(spacing: 24) {
      HeadlineView(viewModel: viewModel)
      Image("BELIVER_ICON", bundle: .module)
        .resizable()
        .aspectRatio(contentMode: .fit)
      ForEach(features.indices, id: \.self) { index in
        let feature = features[index]
        ProFeatureRowView(feature: feature, index: index)
      }
    }
  }
}

#Preview {
  SKUnitBelieverDetailView(viewModel: .vmPreviewForBeliever)
        .padding()
}
