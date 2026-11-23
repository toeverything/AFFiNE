import Foundation
import RevenueCat
import StoreKit
import SwiftUI
import WebKit

public enum NativePaywallPlanKind: String, CaseIterable, Sendable {
  case lite
  case pro
  case ai
}

public struct NativePaywallPriceInfo: Equatable, Sendable {
  public let value: String
  public let suffix: String

  public init(value: String, suffix: String) {
    self.value = value
    self.suffix = suffix
  }
}

@MainActor
public final class NativePaywallBridge: ObservableObject {
  @Published public private(set) var isLoading = false
  @Published public private(set) var isProcessing = false
  @Published public private(set) var priceInfoByPlan: [NativePaywallPlanKind: NativePaywallPriceInfo]
  @Published public private(set) var selectedPlan: NativePaywallPlanKind
  @Published public var errorMessage: String?

  private weak var associatedWebContext: WKWebView?
  private var stripeCheckout: (userID: String, family: String, attemptID: String)?
  private var productsByPlan: [NativePaywallPlanKind: StoreProduct] = [:]
  private let purchaseJournal = AppStorePurchaseJournal()

  public init(initialPlan: NativePaywallPlanKind = .pro) {
    selectedPlan = initialPlan
    priceInfoByPlan = [:]
  }

  public func bind(webView: WKWebView?) {
    associatedWebContext = webView
  }

  public func selectPlan(_ plan: NativePaywallPlanKind) {
    selectedPlan = plan
  }

  public var isReady: Bool {
    productsByPlan.count == NativePaywallPlanKind.allCases.count
  }

  public func priceInfo(for plan: NativePaywallPlanKind) -> NativePaywallPriceInfo? {
    priceInfoByPlan[plan]
  }

  public func prepare() async throws {
    isLoading = true
    defer { isLoading = false }

    guard associatedWebContext != nil else {
      throw bridgeError("Missing required information")
    }
    configurePurchases()

    let products = await Purchases.shared.products(Self.productIdentifiers)
    try Task.checkCancellation()
    guard products.count == Self.productIdentifiers.count else {
      throw bridgeError("Unable to load subscription options right now.")
    }

    var nextProducts: [NativePaywallPlanKind: StoreProduct] = [:]
    for plan in NativePaywallPlanKind.allCases {
      if let product = products.first(where: { $0.productIdentifier == Self.productIdentifier(for: plan) }) {
        nextProducts[plan] = product
      }
    }

    guard nextProducts.count == NativePaywallPlanKind.allCases.count else {
      throw bridgeError("Unable to load subscription options right now.")
    }

    productsByPlan = nextProducts

    var nextPriceInfo: [NativePaywallPlanKind: NativePaywallPriceInfo] = [:]
    for plan in NativePaywallPlanKind.allCases {
      if let product = nextProducts[plan] {
        nextPriceInfo[plan] = Self.makePriceInfo(for: plan, product: product)
      }
    }
    priceInfoByPlan = nextPriceInfo
  }

  public var canEndStripeCheckout: Bool {
    stripeCheckout != nil
  }

  public func endStripeCheckout() async {
    guard let stripeCheckout, let webView = associatedWebContext else { return }
    self.stripeCheckout = nil
    isProcessing = true
    defer { isProcessing = false }
    do {
      let result = try await webView.callAsyncJavaScript(
        "return await window.endStripeCheckout(userID, family, attemptID);",
        arguments: ["userID": stripeCheckout.userID, "family": stripeCheckout.family, "attemptID": stripeCheckout.attemptID],
        contentWorld: .page
      )
      guard result as? Bool == true else {
        throw bridgeError("The Stripe purchase is still being processed. Check AFFiNE billing settings.")
      }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  public func purchaseSelectedPlan() async throws -> Bool {
    guard !Self.isPurchaseFlowActive else { return false }
    stripeCheckout = nil
    Self.isPurchaseFlowActive = true
    isProcessing = true
    defer {
      isProcessing = false
      Self.isPurchaseFlowActive = false
    }

    guard let webView = associatedWebContext else {
      throw bridgeError("Missing required information")
    }
    let plan = selectedPlan
    guard let product = productsByPlan[plan] else {
      throw bridgeError("Unable to load the selected plan.")
    }
    let context = try await configurePurchasesForCurrentUser(in: webView)
    let productID = product.productIdentifier
    let prepared = try await purchaseCommand(
      "Prepare", context: context, productID: productID, intentID: UUID().uuidString, in: webView
    )
    if prepared.status == "processing", prepared.provider == "stripe", let attemptID = prepared.attemptID {
      stripeCheckout = (context.userID, plan == .ai ? "ai" : "pro", attemptID)
      throw bridgeError("End your open Stripe checkout before subscribing through the App Store.")
    }
    guard prepared.status == "prepared", let attemptID = prepared.attemptID else {
      return try interpret(prepared)
    }
    try Task.checkCancellation()
    let handoff = try await purchaseCommand("Claim", context: context, productID: productID, attemptID: attemptID, in: webView)
    guard handoff.status == "start" else { return try interpret(handoff) }
    let currentContext = try? await fetchPurchaseContext(in: webView)
    if Task.isCancelled || currentContext != context || Purchases.shared.appUserID != context.userID {
      let report = AppStorePurchaseReport(
        context: context, productID: productID, attemptID: attemptID, outcome: .canceled
      )
      _ = try? await purchaseJournal.recordAndDeliver(report) { report in
        try await sendPurchaseReport(report, in: webView)
      }
      try Task.checkCancellation()
      throw bridgeError("Unable to verify your current account.")
    }

    let result: PurchaseResultData
    do {
      result = try await Purchases.shared.purchase(product: product)
    } catch {
      throw bridgeError("Your purchase is still being processed. Use Restore purchases to check it.")
    }
    let outcome: AppStorePurchaseReport.Outcome
    if result.userCancelled {
      outcome = .canceled
    } else if let transaction = result.transaction {
      outcome = .submitted(transactionID: transaction.transactionIdentifier)
    } else {
      throw bridgeError("Your purchase is still being processed. Use Restore purchases to check it.")
    }
    let report = AppStorePurchaseReport(
      context: context, productID: productID, attemptID: attemptID, outcome: outcome
    )
    let submitted = try await purchaseJournal.recordAndDeliver(report) { report in
      try await sendPurchaseReport(report, in: webView)
    }
    return try interpret(submitted)
  }

  public func restorePurchases() async throws -> Bool {
    guard !Self.isPurchaseFlowActive else { return false }
    stripeCheckout = nil
    Self.isPurchaseFlowActive = true
    isProcessing = true
    defer {
      isProcessing = false
      Self.isPurchaseFlowActive = false
    }

    guard let webView = associatedWebContext else {
      throw bridgeError("Missing required information")
    }
    let context = try await configurePurchasesForCurrentUser(in: webView)
    let requestedProducts = selectedPlan == .ai
      ? [Self.productIdentifier(for: .ai)]
      : [Self.productIdentifier(for: .lite), Self.productIdentifier(for: .pro)]
    _ = try await Purchases.shared.restorePurchases()
    for await entitlement in StoreKit.Transaction.currentEntitlements {
      guard case let .verified(transaction) = entitlement,
            requestedProducts.contains(transaction.productID) else { continue }
      let restored = try await purchaseCommand(
        "Restore", context: context, productID: transaction.productID,
        transactionID: String(transaction.id), in: webView
      )
      return try interpret(restored)
    }
    throw bridgeError("No active App Store purchase was found for this plan.")
  }
}

private extension NativePaywallBridge {
  static let revenueCatToken = "appl_FIzFhieVpSSmJRYJWwhVrgtnsVf"
  static let revenueCatProxyEndpoint = URL(string: "https://iap.affine.pro/")!
  static var isPurchasesConfigured = false
  static var isPurchaseFlowActive = false

  static let productIdentifiers: [String] = [
    PricingConfiguration.proMonthly.productIdentifier,
    PricingConfiguration.proAnnual.productIdentifier,
    PricingConfiguration.aiAnnual.productIdentifier,
  ]

  static func productIdentifier(for plan: NativePaywallPlanKind) -> String {
    switch plan {
    case .lite:
      PricingConfiguration.proMonthly.productIdentifier
    case .pro:
      PricingConfiguration.proAnnual.productIdentifier
    case .ai:
      PricingConfiguration.aiAnnual.productIdentifier
    }
  }

  func configurePurchases() {
    #if DEBUG
      Purchases.logLevel = .debug
    #endif
    Purchases.proxyURL = Self.revenueCatProxyEndpoint

    if !Self.isPurchasesConfigured {
      let configuration = Configuration
        .builder(withAPIKey: Self.revenueCatToken)
        .with(showStoreMessagesAutomatically: false)
        .build()
      Purchases.configure(with: configuration)
      Self.isPurchasesConfigured = true
    }
  }

  func configurePurchasesForCurrentUser(in webView: WKWebView) async throws -> AppStorePurchaseContext {
    let context = try await fetchPurchaseContext(in: webView)
    await purchaseJournal.replay(in: context) { report in
      try await sendPurchaseReport(report, in: webView)
    }
    configurePurchases()
    _ = try await Purchases.shared.logIn(context.userID)
    return context
  }

  func fetchPurchaseContext(in webView: WKWebView) async throws -> AppStorePurchaseContext {
    let result = try await webView.callAsyncJavaScript(
      "return await window.getAppStorePurchaseContext();",
      contentWorld: .page
    )
    guard let result = result as? [String: String],
          let userID = result["userId"], !userID.isEmpty, userID.count < 256,
          let serverBaseURL = result["serverBaseUrl"], !serverBaseURL.isEmpty else {
      throw bridgeError("Missing required information")
    }
    return AppStorePurchaseContext(serverBaseURL: serverBaseURL, userID: userID)
  }

  func sendPurchaseReport(_ report: AppStorePurchaseReport, in webView: WKWebView) async throws -> AppStorePurchaseResponse {
    try await purchaseCommand(
      report.action, context: report.context, productID: report.productID,
      attemptID: report.attemptID, transactionID: report.transactionID, in: webView
    )
  }

  func purchaseCommand(
    _ action: String,
    context: AppStorePurchaseContext,
    productID: String,
    intentID: String? = nil,
    attemptID: String? = nil,
    transactionID: String? = nil,
    in webView: WKWebView
  ) async throws -> AppStorePurchaseResponse {
    var input = ["purchaseAction": action, "expectedUserId": context.userID, "productId": productID]
    input["intentId"] = intentID
    input["attemptId"] = attemptID
    input["transactionId"] = transactionID
    let value = try await webView.callAsyncJavaScript(
      "return await window.appStorePurchase(input, expectedServerBaseUrl);",
      arguments: ["input": input, "expectedServerBaseUrl": context.serverBaseURL],
      contentWorld: .page
    )
    guard let result = value as? [String: Any], let status = result["status"] as? String else {
      throw bridgeError("Unable to check your purchase. Please try again.")
    }
    return AppStorePurchaseResponse(
      status: status, attemptID: result["attemptId"] as? String, provider: result["provider"] as? String
    )
  }

  func interpret(_ response: AppStorePurchaseResponse) throws -> Bool {
    switch response.status {
    case "confirmed":
      return true
    case "canceled":
      return false
    case "existing":
      if response.provider == "stripe" {
        throw bridgeError("You already subscribe to this plan. Manage it in AFFiNE billing settings.")
      }
      throw bridgeError("You already subscribe to this plan. Manage it in the App Store.")
    case "conflict":
      throw bridgeError("This plan has a purchase that needs verification. Review your subscriptions in AFFiNE billing settings.")
    case "processing":
      throw bridgeError("Your purchase is still being processed. Use Restore purchases to check it.")
    default:
      throw bridgeError("Unable to verify this App Store purchase.")
    }
  }

  static func makePriceInfo(for plan: NativePaywallPlanKind, product: StoreProduct) -> NativePaywallPriceInfo {
    switch plan {
    case .lite:
      return NativePaywallPriceInfo(value: product.localizedPriceString, suffix: "/month")
    case .pro:
      return NativePaywallPriceInfo(value: product.localizedPriceString, suffix: "/year")
    case .ai:
      return NativePaywallPriceInfo(
        value: monthlyEquivalentPrice(for: product) ?? product.localizedPriceString,
        suffix: "/mo, billed annually"
      )
    }
  }

  static func monthlyEquivalentPrice(for product: StoreProduct) -> String? {
    guard let subscriptionPeriod = product.subscriptionPeriod else {
      return nil
    }

    let months: Int
    switch subscriptionPeriod.unit {
    case .month:
      months = max(subscriptionPeriod.value, 1)
    case .year:
      months = max(subscriptionPeriod.value * 12, 12)
    case .week, .day:
      return nil
    @unknown default:
      return nil
    }

    var monthlyPrice = product.price / Decimal(months)
    var rounded = Decimal()
    NSDecimalRound(&rounded, &monthlyPrice, 2, .plain)

    guard let formatter = product.priceFormatter?.copy() as? NumberFormatter else {
      return product.localizedPriceString
    }

    return formatter.string(from: rounded as NSDecimalNumber)
  }

  func bridgeError(_ message: String) -> NSError {
    NSError(
      domain: "NativePaywallBridge",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: NSLocalizedString(message, comment: "")]
    )
  }
}
