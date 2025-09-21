//
//  ProFeaturesCardView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct ProFeaturesCardView: View {
  let features: [Feature]
  let headerText: String

  let timer = Timer
    .publish(every: 0.08, on: .main, in: .common)
    .autoconnect()
  @State var animationIndex: Int64 = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if !headerText.isEmpty {
        Text(headerText)
          .font(.system(size: 13))
          .foregroundColor(AffineColors.textSecondary.color)
          .padding(.horizontal, 4)
      }

      ForEach(Array(features.enumerated()), id: \.element.id) { index, feature in
        ProFeatureRowView(feature: feature, index: index)
          .opacity(index < animationIndex ? 1 : 0)
      }
    }
    .animation(.spring.speed(2), value: animationIndex)
    .onChange(of: features) { _ in animationIndex = 0 }
    .onReceive(timer) { _ in animationIndex += 1 }
    .clipped()
    .padding(16)
    .background(AffineColors.layerBackgroundPrimary.color)
    .cornerRadius(16)
    .shadow(color: AffineColors.layerBorder.color.opacity(0.08), radius: 8, y: 2)
    .animation(.spring.speed(2), value: features)
  }
}

#Preview("Pro") {
  ProFeaturesCardView(features: SKUnitSubcategoryProPlan.default.features, headerText: SKUnitSubcategoryProPlan.default.headerText)
    .padding()
    .background(Color.gray.ignoresSafeArea())
}

#Preview("Pro team") {
  ProFeaturesCardView(
    features: SKUnitSubcategoryProPlan.team.features,
    headerText: SKUnitSubcategoryProPlan.team.headerText
  )
  .padding()
  .background(Color.gray.ignoresSafeArea())
}

#Preview("Self Hosted") {
  ProFeaturesCardView(features: SKUnitSubcategoryProPlan.selfHost.features, headerText: SKUnitSubcategoryProPlan.selfHost.headerText)
    .padding()
    .background(Color.gray.ignoresSafeArea())
}
