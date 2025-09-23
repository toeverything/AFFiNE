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

  @State var selection: SKUnitSubcategoryProPlan
  @State var headerText: String
  @State var features: [Feature]
  @State var animationIndex: Int64 = 0

  let timer = Timer
    .publish(every: 0.075, on: .main, in: .common)
    .autoconnect()

  init(viewModel: ViewModel) {
    _viewModel = .init(wrappedValue: viewModel)
    let item = SKUnitSubcategoryProPlan.default
    _selection = .init(initialValue: item)
    _headerText = .init(initialValue: item.headerText)
    _features = .init(initialValue: item.features)
  }

  var body: some View {
    VStack(spacing: 24) {
      if SKUnitSubcategoryProPlan.allCases.count > 1 {
        Picker("Plan", selection: $selection) {
          ForEach(SKUnitSubcategoryProPlan.allCases) { plan in
            Text(plan.title).tag(plan)
          }
        }
        .pickerStyle(.segmented)
        .onChange(of: selection) { _ in
          viewModel.select(subcategory: selection)
        }
      }

      HeadlineView(viewModel: viewModel)

      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if !headerText.isEmpty {
            Text(headerText)
              .font(.system(size: 13))
              .foregroundColor(AffineColors.textSecondary.color)
              .contentTransition(.numericText())
              .transition(.opacity)
              .padding(.horizontal, 4)
          }

          ForEach(Array(features.enumerated()), id: \.element.id) { index, feature in
            ProFeatureRowView(feature: feature, index: index)
              .opacity(index < animationIndex ? 1 : 0)
          }
        }
        .clipped()
        .padding(16)
        .background(AffineColors.layerBackgroundPrimary.color)
        .cornerRadius(16)
        .shadow(color: AffineColors.layerBorder.color.opacity(0.08), radius: 8, y: 2)
        .padding(16)
      }
      .padding(-16)
      .animation(.spring.speed(2), value: animationIndex)
      .onReceive(timer) { _ in animationIndex += 1 }
      .frame(
        maxWidth: .infinity,
        maxHeight: .infinity,
        alignment: .top
      )
      .onChange(of: selection) { _ in updateSelectionContents() }
    }
  }

  func updateSelectionContents() {
    let headerText = selection.headerText
    if self.headerText != headerText {
      self.headerText = headerText
    }
    let features = selection.features
    if self.features != features {
      self.features = features
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
