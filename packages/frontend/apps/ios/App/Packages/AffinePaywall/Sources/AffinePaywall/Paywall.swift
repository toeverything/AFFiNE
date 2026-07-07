//
//  Paywall.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import RevenueCat
import SwiftUI
import UIKit
import WebKit

public enum Paywall {
  package static let revenueCatToken: String = "appl_FIzFhieVpSSmJRYJWwhVrgtnsVf"
  package static let revenueCatProxyEndpoit = URL(string: "https://iap.affine.pro/")!
  package static var isPurchasesConfigured = false

  private static let setupExecution: Void = {
    #if DEBUG
      Purchases.logLevel = .debug
    #endif
    Purchases.proxyURL = revenueCatProxyEndpoit
    return ()
  }()

  nonisolated
  public static func setup() {
    _ = setupExecution
  }

  @MainActor
  public static func presentWall(
    toController controller: UIViewController,
    bindWebContext context: WKWebView?,
    type: String,
    onDismiss: (@MainActor (Bool) -> Void)? = nil
  ) {
    setup()
    let viewModel = ViewModel()
    if let context { viewModel.bind(context: context) }
    if let onDismiss { viewModel.bind(onDismiss: onDismiss) }
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

  @MainActor
  public static func restorePurchases(
    fromController controller: UIViewController,
    bindWebContext context: WKWebView?
  ) {
    setup()
    let viewModel = ViewModel()
    if let context { viewModel.bind(context: context) }
    viewModel.bind(controller: controller)
    viewModel.restore()
  }
}
