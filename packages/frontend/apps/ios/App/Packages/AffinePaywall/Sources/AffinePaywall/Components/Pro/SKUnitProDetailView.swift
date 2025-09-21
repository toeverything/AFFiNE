//
//  SKUnitProDetailView.swift
//  AffinePaywall
//
//  Created by qaq on 9/17/25.
//

import AffineResources
import SwiftUI

struct SKUnitProDetailView: View {
  @StateObject var viewModel: ViewModel

  @State var selection: SKUnitSubcategoryProPlan = .default

  var body: some View {
    VStack(spacing: 24) {
      Picker("Plan", selection: $selection) {
        ForEach(SKUnitSubcategoryProPlan.allCases) { plan in
          Text(plan.title).tag(plan)
        }
      }
      .pickerStyle(.segmented)
      .onChange(of: selection) { _ in
        viewModel.select(subcategory: selection)
      }

      HeadlineView(viewModel: viewModel)

      ScrollView {
        ProFeaturesCardView(
          features: selection.features,
          headerText: selection.headerText
        )
        .padding(16)
      }
      .padding(-16)
      .frame(
        maxWidth: .infinity,
        maxHeight: .infinity,
        alignment: .top
      )
    }
  }
}

#Preview {
  SKUnitProDetailView(viewModel: .vmPreviewForPro)
    .padding()
    .background(
      AffineColors.layerBackgroundSecondary
        .color
        .ignoresSafeArea()
    )
    .background(Color.gray.opacity(0.25).ignoresSafeArea())
}
