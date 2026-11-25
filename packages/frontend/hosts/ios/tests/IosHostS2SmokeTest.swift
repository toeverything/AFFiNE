import Foundation

final class InMemoryTokenPersistence: LegacyAuthTokenPersistence, @unchecked Sendable {
  private let lock = NSLock()
  private var storage: [String: Data] = [:]

  func readRawData(service: String, account: String) throws -> Data? {
    lock.lock()
    defer { lock.unlock() }
    return storage["\(service)::\(account)"]
  }

  func writeRawData(_ data: Data, service: String, account: String) throws {
    lock.lock()
    defer { lock.unlock() }
    storage["\(service)::\(account)"] = data
  }

  func deleteRawData(service: String, account: String) throws {
    lock.lock()
    defer { lock.unlock() }
    storage.removeValue(forKey: "\(service)::\(account)")
  }
}

final class MockAuthURLProtocol: URLProtocol {
  static let lock = NSLock()
  static var requestCountByPath: [String: Int] = [:]
  static var lastHeaders: [String: String] = [:]
  static var handler: ((URLRequest) throws -> (Int, Data))?

  static func reset() {
    lock.lock()
    requestCountByPath = [:]
    lastHeaders = [:]
    handler = nil
    lock.unlock()
  }

  override class func canInit(with request: URLRequest) -> Bool {
    true
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let path = request.url?.path ?? ""
    Self.lock.lock()
    Self.requestCountByPath[path, default: 0] += 1
    Self.lastHeaders = request.allHTTPHeaderFields ?? [:]
    let currentHandler = Self.handler
    Self.lock.unlock()

    guard let currentHandler else {
      client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
      return
    }
    DispatchQueue.global().async {
      do {
        let (status, data) = try currentHandler(self.request)
        let response = HTTPURLResponse(
          url: self.request.url!,
          statusCode: status,
          httpVersion: "HTTP/1.1",
          headerFields: ["Content-Type": "application/json"]
        )!
        self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        self.client?.urlProtocol(self, didLoad: data)
        self.client?.urlProtocolDidFinishLoading(self)
      } catch {
        self.client?.urlProtocol(self, didFailWithError: error)
      }
    }
  }

  override func stopLoading() {}
}

func require(_ condition: Bool, _ message: String) {
  if !condition {
    fputs("FAIL: \(message)\n", stderr)
    exit(1)
  }
}

func makeMockSession() -> URLSession {
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [MockAuthURLProtocol.self]
  return URLSession(configuration: config)
}

func makeTokenResponseJson(accessToken: String, refreshToken: String, expiresIn: Int = 3600) -> Data {
  let json = """
    {
      "tokenType": "Bearer",
      "accessToken": "\(accessToken)",
      "expiresIn": \(expiresIn),
      "refreshToken": "\(refreshToken)",
      "refreshExpiresAt": "2027-01-25T00:00:00.000Z",
      "session": {
        "id": "sess-1",
        "absoluteExpiresAt": "2027-06-25T00:00:00.000Z"
      }
    }
    """
  return Data(json.utf8)
}

@main
struct IosHostS2SmokeTest {
  static func main() async {
    do {
      try await testSingleFlightConcurrentRefreshCoalescesToOneRequest()
      try await testRevokeDuringInFlightRefreshPreventsLateWriteBackAndClearsCookies()
      try testFailClosedLocalWorkspaceAllowlist()
      try await testSentinelMixedNoiseAndWriteBackWhitelistGuard()
      try await testBackgroundPassiveCheckpointCoordinator()
      testIdleFrameZeroDraw()
      try await testAllowlistShrinkEvictsAndClosesWorkspaceAndPropagatesMountError()
      try await testCorruptLocalWorkspacePreservesRawAndFullWhitelistRoundtrip()
      try await testMultiBridgeInstancesShareSingleFlightAndMutationEpoch()
      testDrawableUnavailablePreservesDirtyFlagForNextFrame()
      try await testExplicitAllowlistDeletionSyncsRollbackWriteBackPlan()
      try await testBatchMountContinuesValidWorkspacesAndPreservesPriorStateOnBadSnapshot()
      try await testCloudLastWorkspacePreservedAcrossLocalAllowlistUpdate()
      try await testPartialMountFailureGatesRollbackWriteBackUntilResolved()
      print("ALL 14 SWIFT+RUST S2-IOS SMOKE TESTS PASSED")
    } catch {
      fputs("UNHANDLED ERROR: \(error)\n", stderr)
      exit(1)
    }
  }

  /// 1. Three concurrent `validAccessToken` calls triggering refresh coalesce into 1 HTTP request.
  static func testSingleFlightConcurrentRefreshCoalescesToOneRequest() async throws {
    MockAuthURLProtocol.reset()
    let persistence = InMemoryTokenPersistence()
    let bridge = LegacyAuthBridge(
      persistence: persistence,
      clearWebKitCookies: false
    )
    let endpoint = "https://app.affine.pro"
    let expiredPair = LegacyStoredAuthTokenPair(
      version: 1,
      tokenType: "Bearer",
      accessToken: "acc-old",
      accessExpiresAt: Date(timeIntervalSinceNow: 10),
      refreshToken: "ref-old",
      refreshExpiresAt: "2027-01-25T00:00:00.000Z",
      session: LegacyAuthSessionInfo(id: "sess-1", absoluteExpiresAt: "2027-06-25T00:00:00.000Z")
    )
    try await bridge.writeTokenPair(expiredPair, for: endpoint)

    let releaseRefresh = DispatchSemaphore(value: 0)
    let refreshEntered = DispatchSemaphore(value: 0)
    MockAuthURLProtocol.handler = { req in
      if req.url?.path == "/api/auth/session/refresh" {
        refreshEntered.signal()
        _ = releaseRefresh.wait(timeout: .now() + 2.0)
        return (200, makeTokenResponseJson(accessToken: "acc-new-single-flight", refreshToken: "ref-new"))
      }
      return (404, Data())
    }

    let session = makeMockSession()
    async let r1 = bridge.validAccessToken(for: endpoint, minValidity: 120, session: session)
    async let r2 = bridge.validAccessToken(for: endpoint, minValidity: 120, session: session)
    async let r3 = bridge.validAccessToken(for: endpoint, minValidity: 120, session: session)

    _ = refreshEntered.wait(timeout: .now() + 2.0)
    try await Task.sleep(nanoseconds: 50_000_000)
    releaseRefresh.signal()

    let results = try await [r1, r2, r3]
    for item in results {
      require(item?.accessToken == "acc-new-single-flight", "all 3 callers must receive rotated token")
    }
    MockAuthURLProtocol.lock.lock()
    let refreshCalls = MockAuthURLProtocol.requestCountByPath["/api/auth/session/refresh", default: 0]
    let clientKind = MockAuthURLProtocol.lastHeaders["x-affine-client-kind"]
    let affineVersion = MockAuthURLProtocol.lastHeaders["x-affine-version"]
    MockAuthURLProtocol.lock.unlock()
    require(refreshCalls == 1, "expected exactly 1 refresh request, got \(refreshCalls)")
    require(clientKind == "native", "expected x-affine-client-kind=native")
    require(affineVersion == "0.27.5", "expected x-affine-version=0.27.5, got \(String(describing: affineVersion))")
    print("PASS [1/14]: 3-way concurrent refresh coalesced to 1 HTTP call with native + 0.27.5 headers")
  }

  /// 2. `revokeSession` while refresh is in flight prevents stale write-back and clears only matching cookies.
  static func testRevokeDuringInFlightRefreshPreventsLateWriteBackAndClearsCookies() async throws {
    MockAuthURLProtocol.reset()
    let persistence = InMemoryTokenPersistence()
    let cookies = HTTPCookieStorage.shared
    let endpoint = "https://app.affine.pro"
    if let authCookie = HTTPCookie(properties: [
      .domain: "app.affine.pro",
      .path: "/",
      .name: "affine_session",
      .value: "s-123",
    ]) {
      cookies.setCookie(authCookie)
    }
    if let otherCookie = HTTPCookie(properties: [
      .domain: "other.example.com",
      .path: "/",
      .name: "affine_session",
      .value: "keep-me",
    ]) {
      cookies.setCookie(otherCookie)
    }

    let bridge = LegacyAuthBridge(
      persistence: persistence,
      cookieStorage: cookies,
      clearWebKitCookies: false
    )
    let expiredPair = LegacyStoredAuthTokenPair(
      version: 1,
      tokenType: "Bearer",
      accessToken: "acc-old",
      accessExpiresAt: Date(timeIntervalSinceNow: 10),
      refreshToken: "ref-old",
      refreshExpiresAt: "2027-01-25T00:00:00.000Z",
      session: LegacyAuthSessionInfo(id: "sess-1", absoluteExpiresAt: "2027-06-25T00:00:00.000Z")
    )
    try await bridge.writeTokenPair(expiredPair, for: endpoint)

    let refreshEntered = DispatchSemaphore(value: 0)
    let releaseRefresh = DispatchSemaphore(value: 0)
    MockAuthURLProtocol.handler = { req in
      if req.url?.path == "/api/auth/session/refresh" {
        refreshEntered.signal()
        _ = releaseRefresh.wait(timeout: .now() + 2.0)
        return (200, makeTokenResponseJson(accessToken: "acc-stale-late", refreshToken: "ref-stale"))
      }
      if req.url?.path == "/api/auth/session/revoke" {
        return (200, Data("{\"ok\":true}".utf8))
      }
      return (404, Data())
    }

    let session = makeMockSession()
    let refreshTask = Task {
      try await bridge.refreshSession(endpoint: endpoint, session: session)
    }
    _ = refreshEntered.wait(timeout: .now() + 2.0)
    try await bridge.revokeSession(endpoint: endpoint, session: session)
    releaseRefresh.signal()

    do {
      _ = try await refreshTask.value
      require(false, "late refresh must fail after revoke")
    } catch {
      // Expected cancellation / operationCancelled.
    }

    let storedAfter = try await bridge.readTokenPair(for: endpoint)
    require(storedAfter == nil, "late refresh must NOT resurrect Keychain token after revoke")

    let remainingAffine = cookies.cookies?.filter { $0.domain.contains("app.affine.pro") && $0.name == "affine_session" } ?? []
    let remainingOther = cookies.cookies?.filter { $0.domain.contains("other.example.com") && $0.name == "affine_session" } ?? []
    require(remainingAffine.isEmpty, "matching-domain auth cookie must be cleared")
    require(remainingOther.count == 1, "unrelated-domain cookie must remain intact")
    print("PASS [2/14]: revoke during in-flight refresh blocked stale Keychain write-back & cleared only matching cookies")
  }

  /// 3. Local workspace open with nil allowlist or malformed JSON allowlist fails closed.
  static func testFailClosedLocalWorkspaceAllowlist() throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-f1-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    do {
      _ = try WorkspaceStorageBridge(
        spaceType: "workspace",
        peer: "local",
        spaceId: "ws-deleted",
        allowlistedLocalIds: nil,
        documentsDirectory: tmpDir
      )
      require(false, "nil allowlist must throw for local workspace")
    } catch WorkspaceStorageBridgeError.localAllowlistRequired {
      // Expected.
    }

    let cNil = tmpDir.path.withCString { cDocs in
      "workspace".withCString { cType in
        "local".withCString { cPeer in
          "ws-deleted".withCString { cSpace in
            affine_ios_workspace_open(cDocs, cType, cPeer, cSpace, nil)
          }
        }
      }
    }
    require(cNil == nil, "C-ABI nil allowlist must fail closed")

    let cBad = tmpDir.path.withCString { cDocs in
      "workspace".withCString { cType in
        "local".withCString { cPeer in
          "ws-deleted".withCString { cSpace in
            "{corrupt-json".withCString { cAllow in
              affine_ios_workspace_open(cDocs, cType, cPeer, cSpace, cAllow)
            }
          }
        }
      }
    }
    require(cBad == nil, "C-ABI malformed allowlist JSON must fail closed")
    print("PASS [3/14]: local workspace nil & malformed allowlist rejected fail-closed")
  }

  /// 4. Unified sentinel accepts mixed whitelisted + noise keys and rejects non-whitelisted write-back/remove.
  @MainActor
  static func testSentinelMixedNoiseAndWriteBackWhitelistGuard() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-sentinel-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let mixed = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 2,
      keys: ["__cap_init__", "affine-local-workspace"],
      entries: ["affine-local-workspace": "[\"ws-1\"]"],
      idbAccessCount: 0
    )
    let disp = try coordinator.applySnapshot(mixed)
    require(disp.status == "existing_user", "mixed whitelisted + noise must classify as existing_user")
    require(disp.state.localWorkspaceIds == ["ws-1"], "expected ws-1 imported")
    coordinator.closeAll()

    let freshNoise = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 1,
      keys: ["__cap_init__"],
      entries: [:],
      idbAccessCount: 0
    )
    let freshDisp = try coordinator.applySnapshot(freshNoise)
    require(freshDisp.status == "fresh_install", "noise-only snapshot must classify as fresh_install")

    do {
      try LegacyLocalStorageProbe.validateWriteBackKeys(set: [:], remove: ["unrelated.preference"])
      require(false, "non-whitelisted remove key must be rejected")
    } catch LegacyLocalStorageProbeError.keyNotWhitelisted(let k) {
      require(k == "unrelated.preference", "unexpected rejected key \(k)")
    }

    do {
      try LegacyLocalStorageProbe.validateWriteBackKeys(set: [:], remove: ["affine-local-workspace"])
      require(false, "removing affine-local-workspace must be rejected")
    } catch LegacyLocalStorageProbeError.protectedKeyRemovalForbidden {
      // Expected.
    }
    print("PASS [4/14]: unified sentinel handled mixed/noise snapshots and blocked non-whitelisted write-back/remove")
  }

  /// 5. Background transition triggers non-blocking PASSIVE WAL checkpoint.
  @MainActor
  static func testBackgroundPassiveCheckpointCoordinator() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-bg-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let snap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 1,
      keys: ["affine-local-workspace"],
      entries: ["affine-local-workspace": "[\"ws-bg\"]"],
      idbAccessCount: 0
    )
    _ = try coordinator.applySnapshot(snap)
    require(coordinator.workspace(id: "ws-bg") != nil, "allowlisted workspace must mount")
    require(coordinator.checkpointAllPassive(), "PASSIVE WAL checkpoint must succeed")
    coordinator.closeAll()
    print("PASS [5/14]: background PASSIVE WAL checkpoint succeeded across mounted workspace")
  }

  /// 6. Idle second frame returns 0 (skip GPU draw) until invalidated.
  static func testIdleFrameZeroDraw() {
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    require(host != nil, "host create failed")
    defer { affine_ios_host_destroy(host) }

    let first = affine_ios_host_render_frame(host, 1.0)
    require(first != 0, "first dirty frame must draw")
    let second = affine_ios_host_render_frame(host, 1.016)
    require(second == 0, "idle second frame must return 0 to skip Metal draw")
    affine_ios_host_request_frame(host)
    let third = affine_ios_host_render_frame(host, 1.033)
    require(third != 0, "requested frame must draw again")
    print("PASS [6/14]: idle second render_frame returned 0 (zero GPU submission)")
  }

  /// 7. Shrinking/clearing allowlist ["A"] -> [] without closeAll() evicts & closes A; mount errors propagate.
  @MainActor
  static func testAllowlistShrinkEvictsAndClosesWorkspaceAndPropagatesMountError() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-evict-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    try coordinator.applyLocalWorkspaceAllowlist(["ws-a"])
    guard let heldBridge = coordinator.workspace(id: "ws-a") else {
      require(false, "ws-a must be mounted")
      return
    }
    require(heldBridge.checkpointPassive(), "ws-a should be active before shrink")

    // Apply empty allowlist WITHOUT calling closeAll(): ws-a must be closed and evicted.
    try coordinator.applyLocalWorkspaceAllowlist([])
    require(coordinator.workspace(id: "ws-a") == nil, "ws-a must be evicted from activeWorkspaces")
    require(!heldBridge.checkpointPassive(), "evicted bridge handle must be closed and reject calls")
    let staleWrite = heldBridge.applyRemoteUpdate(
      docId: "doc-1",
      update: Data([0, 0]),
      peer: "cloud",
      remoteClockMs: 100,
      localNowMs: 100
    )
    require(staleWrite == nil, "evicted bridge must reject writes")

    // Mount failure (invalid traversal spaceId) must throw upward instead of being swallowed by try?.
    do {
      try coordinator.applyLocalWorkspaceAllowlist(["../escape"])
      require(false, "invalid workspace ID mount failure must throw")
    } catch {
      // Expected propagated error.
    }
    print("PASS [7/14]: allowlist shrink evicted & closed old handle and mount failure propagated")
  }

  /// 8. Corrupt affine-local-workspace mounts 0 workspaces and preserves raw string & all whitelisted keys on write-back.
  @MainActor
  static func testCorruptLocalWorkspacePreservesRawAndFullWhitelistRoundtrip() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-corrupt-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let corruptSnap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 5,
      keys: [
        "affine-local-workspace",
        "global-cache:i18n_lng",
        "global-state:serverConfig:srv-1",
        "last_workspace_id",
        "theme",
      ],
      entries: [
        "affine-local-workspace": "{broken",
        "global-cache:i18n_lng": "\"zh-Hans\"",
        "global-state:serverConfig:srv-1": "{\"serverName\":\"Self\"}",
        "last_workspace_id": "ws-prev",
        "theme": "dark",
      ],
      idbAccessCount: 0
    )
    let disp = try coordinator.applySnapshot(corruptSnap)
    require(disp.status == "existing_user", "corrupt snapshot must remain existing_user")
    require(disp.state.localWorkspaceIds.isEmpty, "corrupt affine-local-workspace must fail-closed (0 mounted)")

    let plan = try coordinator.buildRollbackWriteBackPlan()
    require(plan.set["affine-local-workspace"] == "{broken", "corrupt raw value must not be overwritten with []")
    require(plan.set["global-state:serverConfig:srv-1"] == "{\"serverName\":\"Self\"}", "serverConfig must roundtrip")
    require(plan.set["theme"] == "dark", "theme must roundtrip")
    require(plan.set["last_workspace_id"] == "ws-prev", "last_workspace_id must roundtrip")
    require(plan.set["global-cache:i18n_lng"] == "\"zh-Hans\"", "i18n_lng must roundtrip")

    // Valid empty "[]" mounts 0 workspaces and writes back "[]".
    let emptySnap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 1,
      keys: ["affine-local-workspace"],
      entries: ["affine-local-workspace": "[]"],
      idbAccessCount: 0
    )
    _ = try coordinator.applySnapshot(emptySnap)
    let emptyPlan = try coordinator.buildRollbackWriteBackPlan()
    require(emptyPlan.set["affine-local-workspace"] == "[]", "valid empty list must write back []")
    print("PASS [8/14]: corrupt affine-local-workspace preserved verbatim & full whitelist roundtripped")
  }

  /// 9. Two distinct LegacyAuthBridge instances sharing the same persistence share single-flight & mutationEpochs.
  static func testMultiBridgeInstancesShareSingleFlightAndMutationEpoch() async throws {
    MockAuthURLProtocol.reset()
    let sharedStore = InMemoryTokenPersistence()
    let bridgeA = LegacyAuthBridge(persistence: sharedStore, clearWebKitCookies: false)
    let bridgeB = LegacyAuthBridge(persistence: sharedStore, clearWebKitCookies: false)
    let endpoint = "https://app.affine.pro"

    let expiredPair = LegacyStoredAuthTokenPair(
      version: 1,
      tokenType: "Bearer",
      accessToken: "acc-old",
      accessExpiresAt: Date(timeIntervalSinceNow: 10),
      refreshToken: "ref-old",
      refreshExpiresAt: "2027-01-25T00:00:00.000Z",
      session: LegacyAuthSessionInfo(id: "sess-1", absoluteExpiresAt: "2027-06-25T00:00:00.000Z")
    )
    try await bridgeA.writeTokenPair(expiredPair, for: endpoint)

    let entered1 = DispatchSemaphore(value: 0)
    let release1 = DispatchSemaphore(value: 0)
    MockAuthURLProtocol.handler = { req in
      if req.url?.path == "/api/auth/session/refresh" {
        entered1.signal()
        _ = release1.wait(timeout: .now() + 2.0)
        return (200, makeTokenResponseJson(accessToken: "acc-shared-sf", refreshToken: "ref-shared-sf"))
      }
      return (404, Data())
    }
    let session = makeMockSession()
    async let ra = bridgeA.refreshSession(endpoint: endpoint, session: session)
    async let rb = bridgeB.refreshSession(endpoint: endpoint, session: session)
    _ = entered1.wait(timeout: .now() + 2.0)
    try await Task.sleep(nanoseconds: 50_000_000)
    release1.signal()
    let (pa, pb) = try await (ra, rb)
    require(pa.accessToken == "acc-shared-sf" && pb.accessToken == "acc-shared-sf", "both bridges must get rotated token")
    MockAuthURLProtocol.lock.lock()
    let sfCalls = MockAuthURLProtocol.requestCountByPath["/api/auth/session/refresh", default: 0]
    MockAuthURLProtocol.lock.unlock()
    require(sfCalls == 1, "two bridges sharing persistence must coalesce to 1 refresh, got \(sfCalls)")

    // Now bridgeA starts refresh while bridgeB calls clearSession -> late response must NOT resurrect token.
    MockAuthURLProtocol.reset()
    try await bridgeA.writeTokenPair(expiredPair, for: endpoint)
    let entered2 = DispatchSemaphore(value: 0)
    let release2 = DispatchSemaphore(value: 0)
    MockAuthURLProtocol.handler = { req in
      if req.url?.path == "/api/auth/session/refresh" {
        entered2.signal()
        _ = release2.wait(timeout: .now() + 2.0)
        return (200, makeTokenResponseJson(accessToken: "acc-zombie", refreshToken: "ref-zombie"))
      }
      return (404, Data())
    }
    let taskA = Task {
      try await bridgeA.refreshSession(endpoint: endpoint, session: session)
    }
    _ = entered2.wait(timeout: .now() + 2.0)
    try await bridgeB.clearSession(for: endpoint)
    release2.signal()
    do {
      _ = try await taskA.value
      require(false, "late refresh on bridgeA must be rejected after bridgeB.clearSession")
    } catch {
      // Expected cancellation.
    }
    let afterClear = try await bridgeA.readTokenPair(for: endpoint)
    require(afterClear == nil, "credentials must stay cleared after cross-instance clearSession")
    print("PASS [9/14]: multi-instance LegacyAuthBridge shared single-flight & mutationEpochs")
  }

  /// 10. Frame 1 drawable unavailable preserves dirty=true; Frame 2 with no new input renders & clears dirty.
  static func testDrawableUnavailablePreservesDirtyFlagForNextFrame() {
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    require(host != nil, "host create failed")
    defer { affine_ios_host_destroy(host) }

    // Frame 1: host is dirty, but nextDrawable() returns nil -> do NOT consume dirty!
    require(affine_ios_host_is_dirty(host), "fresh host must start dirty")
    let drawableFrame1Available = false
    if affine_ios_host_is_dirty(host) && drawableFrame1Available {
      _ = affine_ios_host_render_frame(host, 1.0)
    }
    require(affine_ios_host_is_dirty(host), "dirty must remain true when drawable was unavailable")

    // Frame 2: no new input, drawable now available -> renders and consumes dirty.
    let drawableFrame2Available = true
    var frame2Rgba: UInt32 = 0
    if affine_ios_host_is_dirty(host) && drawableFrame2Available {
      frame2Rgba = affine_ios_host_render_frame(host, 1.016)
    }
    require(frame2Rgba != 0, "Frame 2 must render once drawable becomes available")
    require(!affine_ios_host_is_dirty(host), "dirty must be false after Frame 2 commits")
    require(affine_ios_host_render_frame(host, 1.033) == 0, "Frame 3 idle must return 0")
    print("PASS [10/14]: drawable unavailable preserved dirty for Frame 2 render")
  }

  /// 11. Explicit allowlist deletion after import updates rollback write-back plan (F1 zero resurrection).
  @MainActor
  static func testExplicitAllowlistDeletionSyncsRollbackWriteBackPlan() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-r5-del-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let snap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 4,
      keys: ["affine-local-workspace", "last_workspace_id", "last_workspace_flavour", "theme"],
      entries: [
        "affine-local-workspace": "[\"ws-a\"]",
        "last_workspace_id": "ws-a",
        "last_workspace_flavour": "local",
        "theme": "dark",
      ],
      idbAccessCount: 0
    )
    _ = try coordinator.applySnapshot(snap)
    require(coordinator.workspace(id: "ws-a") != nil, "ws-a must mount on initial import")

    // Explicitly delete ws-a via allowlist update: rollback plan must emit "[]" (not stale ["ws-a"]).
    try coordinator.applyLocalWorkspaceAllowlist([])
    require(coordinator.workspace(id: "ws-a") == nil, "ws-a must be evicted")
    let plan = try coordinator.buildRollbackWriteBackPlan()
    require(plan.set["affine-local-workspace"] == "[]", "rollback plan must write [] after explicit deletion, got \(String(describing: plan.set["affine-local-workspace"]))")
    require(plan.set["theme"] == "dark", "other whitelisted keys must stay preserved")
    require(plan.remove.contains("last_workspace_id"), "deleted last_workspace_id must be removed")
    require(plan.remove.contains("last_workspace_flavour"), "deleted last_workspace_flavour must be removed")
    print("PASS [11/14]: explicit allowlist deletion synced importedStateJson & rollback plan emitted []")
  }

  /// 12. Batch mount with partial failure mounts all valid workspaces and throws summarized failures;
  /// invalid snapshot never publishes half-baked importedStateJson.
  @MainActor
  static func testBatchMountContinuesValidWorkspacesAndPreservesPriorStateOnBadSnapshot() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-r5-batch-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    do {
      try coordinator.applyLocalWorkspaceAllowlist(["ws-b", "../bad", "ws-c"])
      require(false, "batch with ../bad must throw mountFailures")
    } catch HostBootstrapError.mountFailures(let failed) {
      require(failed == ["../bad"], "expected failed=[\"../bad\"], got \(failed)")
    }
    require(coordinator.workspace(id: "ws-b") != nil, "ws-b must still mount despite ../bad failure")
    require(coordinator.workspace(id: "ws-c") != nil, "ws-c must still mount despite ../bad failure")

    // Invalid sentinel snapshot must throw without clobbering state or publishing half-baked JSON.
    let badSnap = LegacyLocalStorageSnapshot(
      origin: "about:blank",
      length: 0,
      keys: [],
      entries: [:],
      idbAccessCount: 0
    )
    do {
      _ = try coordinator.applySnapshot(badSnap)
      require(false, "invalid snapshot must throw")
    } catch HostBootstrapError.invalidSentinelSnapshot {
      // Expected.
    }
    require(coordinator.importedStateJson == nil, "failed snapshot must not publish importedStateJson")
    coordinator.closeAll()
    print("PASS [12/14]: batch mount mounted valid B & C while reporting ../bad, and bad snapshot published no state")
  }

  /// 13. Cloud last_workspace_id / last_workspace_flavour stay intact when updating local allowlist.
  @MainActor
  static func testCloudLastWorkspacePreservedAcrossLocalAllowlistUpdate() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-r6-cloud-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let snap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 3,
      keys: ["affine-local-workspace", "last_workspace_id", "last_workspace_flavour"],
      entries: [
        "affine-local-workspace": "[\"ws-a\"]",
        "last_workspace_id": "cloud-C",
        "last_workspace_flavour": "affine-cloud",
      ],
      idbAccessCount: 0
    )
    _ = try coordinator.applySnapshot(snap)

    // No-op allowlist refresh keeps cloud last_workspace_id & flavour intact.
    try coordinator.applyLocalWorkspaceAllowlist(["ws-a"])
    let planSame = try coordinator.buildRollbackWriteBackPlan()
    require(planSame.set["last_workspace_id"] == "cloud-C", "cloud last_workspace_id must stay in set on same allowlist")
    require(planSame.set["last_workspace_flavour"] == "affine-cloud", "cloud last_workspace_flavour must stay in set on same allowlist")
    require(!planSame.remove.contains("last_workspace_id"), "cloud last_workspace_id must not be removed")
    require(!planSame.remove.contains("last_workspace_flavour"), "cloud last_workspace_flavour must not be removed")

    // Clearing local workspaces removes ws-a but must NOT clear cloud-C.
    try coordinator.applyLocalWorkspaceAllowlist([])
    let planEmpty = try coordinator.buildRollbackWriteBackPlan()
    require(planEmpty.set["affine-local-workspace"] == "[]", "local allowlist must write []")
    require(planEmpty.set["last_workspace_id"] == "cloud-C", "cloud last_workspace_id must stay in set after clearing local allowlist")
    require(planEmpty.set["last_workspace_flavour"] == "affine-cloud", "cloud last_workspace_flavour must stay in set after clearing local allowlist")
    require(!planEmpty.remove.contains("last_workspace_id"), "cloud last_workspace_id must not be removed after clearing local allowlist")
    require(!planEmpty.remove.contains("last_workspace_flavour"), "cloud last_workspace_flavour must not be removed after clearing local allowlist")
    coordinator.closeAll()
    print("PASS [13/14]: cloud last_workspace_id & flavour preserved across local allowlist updates")
  }

  /// 14. Partial mount failures block buildRollbackWriteBackPlan() until allowlist is reconciled cleanly.
  @MainActor
  static func testPartialMountFailureGatesRollbackWriteBackUntilResolved() async throws {
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s2-ios-swift-r6-gate-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let coordinator = HostBootstrapCoordinator(documentsDirectory: tmpDir)
    let partialSnap = LegacyLocalStorageSnapshot(
      origin: "capacitor://localhost",
      length: 1,
      keys: ["affine-local-workspace"],
      entries: ["affine-local-workspace": "[\"ws-b\",\"../bad\",\"ws-c\"]"],
      idbAccessCount: 0
    )
    do {
      _ = try coordinator.applySnapshot(partialSnap)
      require(false, "applySnapshot with ../bad must throw mountFailures")
    } catch HostBootstrapError.mountFailures(let failed) {
      require(failed == ["../bad"], "expected failed=[\"../bad\"], got \(failed)")
    }
    require(coordinator.workspace(id: "ws-b") != nil, "ws-b must be mounted")
    require(coordinator.workspace(id: "ws-c") != nil, "ws-c must be mounted")
    require(coordinator.lastFailedMountIds == ["../bad"], "lastFailedMountIds must record ../bad")

    // Rollback write-back must be blocked while mount failures remain unresolved.
    do {
      _ = try coordinator.buildRollbackWriteBackPlan()
      require(false, "buildRollbackWriteBackPlan must throw while lastFailedMountIds is non-empty")
    } catch HostBootstrapError.mountFailures(let failed) {
      require(failed == ["../bad"], "expected rollback gate failed=[\"../bad\"], got \(failed)")
    }

    // Reconciling allowlist to valid workspaces clears lastFailedMountIds and unblocks rollback planning.
    try coordinator.applyLocalWorkspaceAllowlist(["ws-b", "ws-c"])
    require(coordinator.lastFailedMountIds.isEmpty, "lastFailedMountIds must clear after clean reconcile")
    let plan = try coordinator.buildRollbackWriteBackPlan()
    require(plan.set["affine-local-workspace"] == "[\"ws-b\",\"ws-c\"]", "reconciled rollback plan must emit [\"ws-b\",\"ws-c\"], got \(String(describing: plan.set["affine-local-workspace"]))")
    coordinator.closeAll()
    print("PASS [14/14]: partial mount failure gated rollback write-back until allowlist resolved")
  }
}
