//
//  Paywall.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import SwiftUI
import UIKit

public enum Paywall {
  @MainActor
  public static func presentWall(
    toController controller: UIViewController,
    type: String
  ) {
    let viewModel = ViewModel()
    switch type.lowercased() {
    case "pro":
      viewModel.select(category: .pro)
      viewModel.select(subcategory: SKUnitSubcategoryProPlan.default)
    case "ai":
      viewModel.select(category: .ai)
      viewModel.select(subcategory: SKUnitSingleSubcategory.single)
    default:
      break
    }
    let view = AffinePaywallPageView(viewModel: viewModel)
    let hostingController = UIHostingController(rootView: view)
    viewModel.bind(controller: hostingController)
    hostingController.modalPresentationStyle = .overFullScreen
    hostingController.modalTransitionStyle = .coverVertical
    hostingController.preferredContentSize = CGSize(width: 555, height: 555) // for iPads
    controller.present(hostingController, animated: true)
  }
}
