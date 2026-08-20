import Foundation
import RevenueCat
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

  public func purchaseSelectedPlan() async throws -> Bool {
    isProcessing = true
    defer { isProcessing = false }

    guard let webView = associatedWebContext else {
      throw bridgeError("Missing required information")
    }
    try await configurePurchasesForCurrentUser(in: webView)

    guard let product = productsByPlan[selectedPlan] else {
      throw bridgeError("Unable to load the selected plan.")
    }

    let result = try await Purchases.shared.purchase(product: product)
    if result.userCancelled {
      return false
    }

    try Task.checkCancellation()

    if let transaction = result.transaction {
      try await applySubscription(transactionID: transaction.transactionIdentifier, in: webView)
    } else {
      try await updateSubscriptionState(in: webView)
    }

    return true
  }

  public func restorePurchases() async throws {
    isProcessing = true
    defer { isProcessing = false }

    guard let webView = associatedWebContext else {
      throw bridgeError("Missing required information")
    }
    try await configurePurchasesForCurrentUser(in: webView)
    _ = try await Purchases.shared.restorePurchases()
    try await updateSubscriptionState(in: webView)
  }
}

private extension NativePaywallBridge {
  static let revenueCatToken = "appl_FIzFhieVpSSmJRYJWwhVrgtnsVf"
  static let revenueCatProxyEndpoint = URL(string: "https://iap.affine.pro/")!
  static var isPurchasesConfigured = false

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

  func configurePurchasesForCurrentUser(in webView: WKWebView) async throws {
    configurePurchases()
    let userIdentifier = try await fetchCurrentUserIdentifier(in: webView)
    _ = try await Purchases.shared.logIn(userIdentifier)
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

  func applySubscription(transactionID: String, in webView: WKWebView) async throws {
    _ = try await webView.callAsyncJavaScript(
      "return await window.requestApplySubscription(transactionID);",
      arguments: ["transactionID": transactionID],
      contentWorld: .page
    )
  }

  func updateSubscriptionState(in webView: WKWebView) async throws {
    _ = try await webView.callAsyncJavaScript(
      "return await window.updateSubscriptionState();",
      contentWorld: .page
    )
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
