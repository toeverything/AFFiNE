//
//  IntelligentFeatureView.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

struct IntelligentFeatureView: View {
  let feature: Feature

  struct Feature: Identifiable {
    let id: UUID = .init()
    let preview: String
    let icon: String
    let title: String
    let features: [String]
  }

  var body: some View {
    VStack(spacing: 24) {
      Image(feature.preview, bundle: .module)
        .resizable()
        .aspectRatio(contentMode: .fit)
      HStack(spacing: 8) {
        Image(feature.icon, bundle: .module)
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(width: 24, height: 24)
        Text(feature.title)
          .font(.system(size: 24, weight: .semibold, design: .default))
      }
      VStack(alignment: .leading, spacing: 12) {
        ForEach(feature.features, id: \.self) { item in
          HStack(alignment: .firstTextBaseline, spacing: 12) {
            Rectangle()
              .frame(width: 4, height: 10)
              .foregroundStyle(.clear)
              .overlay {
                Image(systemName: "circle.fill")
                  .font(.system(size: 4))
                  .foregroundColor(AffineColors.textSecondary.color)
              }
            Text(item)
              .font(.system(size: 16))
              .foregroundColor(AffineColors.textSecondary.color)
              .lineLimit(nil)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

#Preview {
  IntelligentFeatureView(
    feature: SKUnitIntelligentDetailView.features.first!
  )
  .padding()
}
