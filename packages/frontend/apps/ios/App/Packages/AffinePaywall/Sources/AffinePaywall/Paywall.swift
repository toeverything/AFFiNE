//
//  File.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import UIKit
import SwiftUI

public enum Paywall {
  @MainActor
  public static func presentWall(
    toController controller: UIViewController,
    type: String
  ) {
    let viewModel = ViewModel()
    switch type {
    // TODO: FIGURE OUT PAYWALL TYPES
    default:
      break
    }
    let view = AffinePaywallPageView(viewModel: viewModel)
    let hostingController = UIHostingController(rootView: view)
    hostingController.modalPresentationStyle = .overFullScreen
    hostingController.modalTransitionStyle = .coverVertical
    hostingController.preferredContentSize = CGSize(width: 555, height: 555) // for iPads
    controller.present(hostingController, animated: true)
  }
}
