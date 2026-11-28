import Foundation
import StoreKit

/// Authoritative verified StoreKit 2 entitlement snapshot persisted atomically on disk.
struct PaywallEntitlementSnapshot: Codable, Equatable {
  let transactionId: String
  let productId: String
  let jwsRepresentation: String
  let expirationDate: Date?
  let revocationDate: Date?
}

/// Zero-CocoaPods StoreKit 2 paywall narrow bridge (`AffinePaywall`).
/// Uses `Transaction.currentEntitlements` as the authoritative active set (atomic replacement,
/// clearing expired/revoked entitlements from both disk and Rust) and only calls `tx.finish()`
/// after disk persistence + Rust state synchronization succeed.
@MainActor
final class AffinePaywallBridge {
  nonisolated static let defaultProductIds: [String] = [
    "pro.affine.pro.monthly",
    "pro.affine.pro.yearly",
    "pro.affine.ai.monthly",
    "pro.affine.ai.yearly",
  ]

  private var hostHandle: OpaquePointer?
  private var updatesTask: Task<Void, Never>?
  private let entitlementFileUrl: URL
  private(set) var activeEntitlements: [String: PaywallEntitlementSnapshot] = [:]

  private static func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }

  private static func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }

  /// Single authoritative entitlement active predicate: verified, not revoked, and not expired.
  nonisolated static func isActiveEntitlement(
    revocationDate: Date?,
    expirationDate: Date?,
    now: Date = Date()
  ) -> Bool {
    guard revocationDate == nil else {
      return false
    }
    if let expirationDate {
      return expirationDate > now
    }
    return true
  }

  init(entitlementFileUrl: URL? = nil) {
    if let entitlementFileUrl {
      self.entitlementFileUrl = entitlementFileUrl
    } else if let appSupport = FileManager.default.urls(
      for: .applicationSupportDirectory,
      in: .userDomainMask
    ).first {
      self.entitlementFileUrl = appSupport
        .appendingPathComponent("affine-paywall", isDirectory: true)
        .appendingPathComponent("verified-entitlements.json")
    } else {
      self.entitlementFileUrl = FileManager.default.temporaryDirectory
        .appendingPathComponent("affine-paywall-entitlements.json")
    }
  }

  deinit {
    updatesTask?.cancel()
  }

  func attach(host: OpaquePointer, now: Date = Date()) {
    hostHandle = host
    restorePersistedEntitlements(into: host, now: now)
  }

  func detach() {
    updatesTask?.cancel()
    updatesTask = nil
    hostHandle = nil
  }

  private func persistActiveEntitlements() -> Bool {
    let fm = FileManager.default
    if activeEntitlements.isEmpty {
      if fm.fileExists(atPath: entitlementFileUrl.path) {
        do {
          try fm.removeItem(at: entitlementFileUrl)
        } catch {
          return false
        }
      }
      return true
    }
    let sorted = activeEntitlements.values.sorted { $0.transactionId < $1.transactionId }
    do {
      try fm.createDirectory(
        at: entitlementFileUrl.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      let data = try Self.makeEncoder().encode(sorted)
      try data.write(to: entitlementFileUrl, options: .atomic)
      return true
    } catch {
      return false
    }
  }

  private func syncRustEntitlementState(host: OpaquePointer) -> Bool {
    guard let primary = activeEntitlements.values.sorted(by: { $0.transactionId < $1.transactionId }).first else {
      return affine_ios_island_paywall_clear_entitlements(host)
    }
    return primary.transactionId.withCString { cTx in
      primary.jwsRepresentation.withCString { cJws in
        affine_ios_island_paywall_complete_jws(host, cTx, cJws)
      }
    }
  }

  /// Restores any still-active persisted entitlements into Rust (pruning expired/revoked cache).
  @discardableResult
  func restorePersistedEntitlements(into host: OpaquePointer, now: Date = Date()) -> Bool {
    guard
      let data = try? Data(contentsOf: entitlementFileUrl),
      let records = try? Self.makeDecoder().decode([PaywallEntitlementSnapshot].self, from: data)
    else {
      activeEntitlements = [:]
      return false
    }
    return reconcileCurrentEntitlements(records, host: host, now: now)
  }

  /// Atomically replaces the in-memory + on-disk active entitlement set with `snapshots`
  /// (filtering through `isActiveEntitlement`) and synchronizes Rust paywall state.
  /// When the active set is empty, deletes the disk cache and clears Rust back to unauthorized.
  @discardableResult
  func reconcileCurrentEntitlements(
    _ snapshots: [PaywallEntitlementSnapshot],
    host: OpaquePointer? = nil,
    now: Date = Date()
  ) -> Bool {
    guard let activeHost = host ?? hostHandle else {
      return false
    }
    var nextActive: [String: PaywallEntitlementSnapshot] = [:]
    for snap in snapshots {
      guard Self.isActiveEntitlement(
        revocationDate: snap.revocationDate,
        expirationDate: snap.expirationDate,
        now: now
      ) else {
        continue
      }
      nextActive[snap.transactionId] = snap
    }
    activeEntitlements = nextActive
    let persisted = persistActiveEntitlements()
    let synced = syncRustEntitlementState(host: activeHost)
    return persisted && synced
  }

  /// Applies one verified transaction update (purchase, renewal, expiration, or revocation).
  /// Returns `true` ONLY after both Rust state and disk persistence succeed (caller may then
  /// call `await tx.finish()`).
  @discardableResult
  func applyVerifiedTransactionUpdate(
    _ snapshot: PaywallEntitlementSnapshot,
    host: OpaquePointer? = nil,
    now: Date = Date()
  ) -> Bool {
    guard let activeHost = host ?? hostHandle else {
      return false
    }
    // Prune any previously cached entitlements that have since expired.
    activeEntitlements = activeEntitlements.filter { _, existing in
      Self.isActiveEntitlement(
        revocationDate: existing.revocationDate,
        expirationDate: existing.expirationDate,
        now: now
      )
    }

    if Self.isActiveEntitlement(
      revocationDate: snapshot.revocationDate,
      expirationDate: snapshot.expirationDate,
      now: now
    ) {
      let accepted = snapshot.transactionId.withCString { cTx in
        snapshot.jwsRepresentation.withCString { cJws in
          affine_ios_island_paywall_complete_jws(activeHost, cTx, cJws)
        }
      }
      guard accepted else {
        return false
      }
      activeEntitlements[snapshot.transactionId] = snapshot
      return persistActiveEntitlements()
    } else {
      activeEntitlements.removeValue(forKey: snapshot.transactionId)
      let persisted = persistActiveEntitlements()
      let synced = syncRustEntitlementState(host: activeHost)
      return persisted && synced
    }
  }

  /// Syncs authoritative StoreKit 2 `Transaction.currentEntitlements` by collecting the full
  /// active set and atomically replacing memory, disk cache, and Rust entitlement state.
  @available(iOS 15.0, *)
  func syncCurrentEntitlements(now: Date = Date()) async {
    var collected: [PaywallEntitlementSnapshot] = []
    for await verification in Transaction.currentEntitlements {
      guard !Task.isCancelled, hostHandle != nil else {
        return
      }
      if case .verified(let tx) = verification {
        collected.append(
          PaywallEntitlementSnapshot(
            transactionId: String(tx.id),
            productId: tx.productID,
            jwsRepresentation: verification.jwsRepresentation,
            expirationDate: tx.expirationDate,
            revocationDate: tx.revocationDate
          )
        )
      }
    }
    guard !Task.isCancelled, let activeHost = hostHandle else {
      return
    }
    _ = reconcileCurrentEntitlements(collected, host: activeHost, now: now)
  }

  /// Queries StoreKit 2 products and syncs the catalog into Rust.
  func loadProducts(host: OpaquePointer? = nil, productIds: [String] = defaultProductIds) async -> Bool {
    if let host {
      hostHandle = host
    }
    guard let products = try? await Product.products(for: productIds) else {
      return false
    }
    guard !Task.isCancelled, let activeHost = hostHandle else {
      return false
    }
    let payload: [[String: String]] = products.map {
      [
        "product_id": $0.id,
        "display_name": $0.displayName,
        "display_price": $0.displayPrice,
      ]
    }
    return syncProductsPayload(host: activeHost, payload: payload)
  }

  /// Deterministic entry point for syncing a product list into the Rust paywall state machine.
  func syncProductsPayload(host: OpaquePointer, payload: [[String: String]]) -> Bool {
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else {
      return false
    }
    return json.withCString { affine_ios_island_paywall_set_products_json(host, $0) }
  }

  /// Starts listening to `StoreKit.Transaction.updates` and reconciles `currentEntitlements`.
  func startTransactionListener(host: OpaquePointer? = nil) {
    if let host {
      hostHandle = host
      restorePersistedEntitlements(into: host)
    }
    updatesTask?.cancel()
    updatesTask = Task { [weak self] in
      if #available(iOS 15.0, *) {
        await self?.syncCurrentEntitlements()
      }
      for await verification in Transaction.updates {
        guard !Task.isCancelled, let self, let activeHost = self.hostHandle else {
          break
        }
        if case .verified(let tx) = verification {
          let snapshot = PaywallEntitlementSnapshot(
            transactionId: String(tx.id),
            productId: tx.productID,
            jwsRepresentation: verification.jwsRepresentation,
            expirationDate: tx.expirationDate,
            revocationDate: tx.revocationDate
          )
          let persisted = self.applyVerifiedTransactionUpdate(snapshot, host: activeHost)
          // Only finish the StoreKit transaction after disk persistence + Rust sync succeed.
          if persisted {
            await tx.finish()
          }
        }
      }
    }
  }

  /// Queries StoreKit 2 `Product.products(for:)`, initiates `product.purchase()`, and only
  /// calls `tx.finish()` after Rust + disk persistence both succeed.
  @available(iOS 15.0, *)
  func purchaseProduct(productId: String) async -> Bool {
    guard !Task.isCancelled, let activeHost = hostHandle else {
      return false
    }
    guard beginPurchase(host: activeHost, productId: productId) else {
      return false
    }
    guard
      let products = try? await Product.products(for: [productId]),
      let product = products.first(where: { $0.id == productId })
    else {
      return false
    }
    guard !Task.isCancelled, hostHandle != nil else {
      return false
    }
    guard let result = try? await product.purchase() else {
      return false
    }
    guard !Task.isCancelled, let postHost = hostHandle else {
      return false
    }
    switch result {
    case .success(let verification):
      if case .verified(let tx) = verification {
        let snapshot = PaywallEntitlementSnapshot(
          transactionId: String(tx.id),
          productId: tx.productID,
          jwsRepresentation: verification.jwsRepresentation,
          expirationDate: tx.expirationDate,
          revocationDate: tx.revocationDate
        )
        let persisted = applyVerifiedTransactionUpdate(snapshot, host: postHost)
        if persisted {
          await tx.finish()
          return Self.isActiveEntitlement(
            revocationDate: tx.revocationDate,
            expirationDate: tx.expirationDate
          )
        }
      }
      return false
    case .pending, .userCancelled:
      return false
    @unknown default:
      return false
    }
  }

  func stopTransactionListener() {
    updatesTask?.cancel()
    updatesTask = nil
  }

  func beginPurchase(host: OpaquePointer, productId: String) -> Bool {
    productId.withCString { affine_ios_island_paywall_begin_purchase(host, $0) }
  }

  func stateJson(host: OpaquePointer) -> String {
    guard let ptr = affine_ios_island_paywall_state_json(host) else {
      return "{}"
    }
    defer { affine_ios_string_free(ptr) }
    return String(cString: ptr)
  }
}
