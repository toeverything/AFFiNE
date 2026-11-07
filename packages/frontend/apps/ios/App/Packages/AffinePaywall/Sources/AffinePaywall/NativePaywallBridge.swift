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
    let userID = try await configurePurchasesForCurrentUser(in: webView)
    let productID = product.productIdentifier
    let prepared = try await purchaseCommand(
      "Prepare", userID: userID, productID: productID, intentID: UUID().uuidString, in: webView
    )
    if prepared.status == "processing", prepared.provider == "stripe", let attemptID = prepared.attemptID {
      stripeCheckout = (userID, plan == .ai ? "ai" : "pro", attemptID)
      throw bridgeError("End your open Stripe checkout before subscribing through the App Store.")
    }
    guard prepared.status == "prepared", let attemptID = prepared.attemptID else {
      return try interpret(prepared)
    }
    try Task.checkCancellation()
    let handoff = try await purchaseCommand("Claim", userID: userID, productID: productID, attemptID: attemptID, in: webView)
    guard handoff.status == "start" else { return try interpret(handoff) }
    let currentUserID = try? await fetchCurrentUserIdentifier(in: webView)
    if Task.isCancelled || currentUserID != userID || Purchases.shared.appUserID != userID {
      _ = try? await purchaseCommand("Cancel", userID: userID, productID: productID, attemptID: attemptID, in: webView)
      try Task.checkCancellation()
      throw bridgeError("Unable to verify your current account.")
    }

    let result: PurchaseResultData
    do {
      result = try await Purchases.shared.purchase(product: product)
    } catch {
      throw bridgeError("Your purchase is still being processed. Use Restore purchases to check it.")
    }
    if result.userCancelled {
      let canceled = try await purchaseCommand(
        "Cancel", userID: userID, productID: productID, attemptID: attemptID, in: webView
      )
      return try interpret(canceled)
    }
    guard let transaction = result.transaction else {
      throw bridgeError("Your purchase is still being processed. Use Restore purchases to check it.")
    }
    let submitted = try await purchaseCommand(
      "Submit", userID: userID, productID: productID, attemptID: attemptID,
      transactionID: transaction.transactionIdentifier, in: webView
    )
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
    let userID = try await configurePurchasesForCurrentUser(in: webView)
    let requestedProducts = selectedPlan == .ai
      ? [Self.productIdentifier(for: .ai)]
      : [Self.productIdentifier(for: .lite), Self.productIdentifier(for: .pro)]
    _ = try await Purchases.shared.restorePurchases()
    for await entitlement in StoreKit.Transaction.currentEntitlements {
      guard case let .verified(transaction) = entitlement,
            requestedProducts.contains(transaction.productID) else { continue }
      let restored = try await purchaseCommand(
        "Restore", userID: userID, productID: transaction.productID,
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

  func configurePurchasesForCurrentUser(in webView: WKWebView) async throws -> String {
    configurePurchases()
    let userIdentifier = try await fetchCurrentUserIdentifier(in: webView)
    _ = try await Purchases.shared.logIn(userIdentifier)
    return userIdentifier
  }

  func fetchCurrentUserIdentifier(in webView: WKWebView) async throws -> String {
    let result = try await webView.callAsyncJavaScript(
      "return await window.getCurrentUserIdentifier();",
      contentWorld: .page
    )
    let userIdentifier = (result as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    guard !userIdentifier.isEmpty, userIdentifier.count < 256 else {
      throw bridgeError("Missing required information")
    }

    return userIdentifier
  }

  struct PurchaseResponse {
    let status: String
    let attemptID: String?
    let provider: String?
  }

  func purchaseCommand(
    _ action: String,
    userID: String,
    productID: String,
    intentID: String? = nil,
    attemptID: String? = nil,
    transactionID: String? = nil,
    in webView: WKWebView
  ) async throws -> PurchaseResponse {
    var input = ["purchaseAction": action, "expectedUserId": userID, "productId": productID]
    input["intentId"] = intentID
    input["attemptId"] = attemptID
    input["transactionId"] = transactionID
    let value = try await webView.callAsyncJavaScript(
      "return await window.appStorePurchase(input);",
      arguments: ["input": input],
      contentWorld: .page
    )
    guard let result = value as? [String: Any], let status = result["status"] as? String else {
      throw bridgeError("Unable to check your purchase. Please try again.")
    }
    return PurchaseResponse(
      status: status, attemptID: result["attemptId"] as? String, provider: result["provider"] as? String
    )
  }

  func interpret(_ response: PurchaseResponse) throws -> Bool {
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
