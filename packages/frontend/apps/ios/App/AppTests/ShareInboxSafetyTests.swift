import XCTest

private final class SharePreviewURLProtocol: URLProtocol {
  static var onStart: ((URLProtocol, URLRequest) -> Void)?
  static var onStop: (() -> Void)?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() { Self.onStart?(self, request) }
  override func stopLoading() { Self.onStop?() }
}

final class ShareInboxSafetyTests: XCTestCase {
  private func makeStore() throws -> (store: ShareInboxStore, containerURL: URL) {
    let containerURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("ShareInboxSafetyTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)
    addTeardownBlock {
      try? FileManager.default.removeItem(at: containerURL)
    }
    return (ShareInboxStore(fileManager: .default, containerURL: containerURL), containerURL)
  }

  private func v1Manifest(id: String, documentId: String) -> Data {
    Data(
      """
      {
        "id":"\(id)",
        "documentId":"\(documentId)",
        "createdAt":"2026-08-27T00:00:00Z",
        "title":"Original",
        "content":{"kind":"url","url":"https://example.com/original?token=value"},
        "previewRoute":"official",
        "attachments":[]
      }
      """.utf8
    )
  }

  func testNewManifestEncodesVersionTwoAndImportAttemptIDWithoutPreviewRoute() throws {
    let item = ShareInboxItem(
      title: "Shared",
      content: ShareInboxContent(kind: .url, url: "https://example.com", text: nil)
    )
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let manifest = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoder.encode(item)) as? [String: Any]
    )

    XCTAssertEqual(manifest["schemaVersion"] as? Int, 2)
    XCTAssertFalse((manifest["importAttemptId"] as? String ?? "").isEmpty)
    XCTAssertNil(manifest["previewRoute"])
  }

  func testStoreMigratesV1ManifestOnceAndAtomicallyPersistsV2BeforeReturningReady() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let id = UUID().uuidString
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(id).json")
    try v1Manifest(id: id, documentId: UUID().uuidString).write(to: manifestURL)

    let entries = store.pendingItems()
    XCTAssertEqual(entries.count, 1)
    guard case let .ready(migrated) = entries[0] else {
      return XCTFail("Expected the v1 manifest to migrate to a ready entry")
    }
    XCTAssertEqual(migrated.schemaVersion, 2)
    XCTAssertFalse(migrated.importAttemptId.isEmpty)
    XCTAssertEqual(migrated.previewRoute, .official)

    let rewritten = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any]
    )
    XCTAssertEqual(rewritten["schemaVersion"] as? Int, 2)
    XCTAssertEqual(rewritten["importAttemptId"] as? String, migrated.importAttemptId)
    XCTAssertNil(rewritten["previewRoute"])

    guard case let .ready(reloaded) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected the rewritten v2 manifest to remain ready")
    }
    XCTAssertEqual(reloaded.importAttemptId, migrated.importAttemptId)
  }

  func testStorePreservesUnknownFutureVersionAndReturnsUnsupportedEntry() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let id = UUID().uuidString
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(id).json")
    let futureManifest = Data("{\"schemaVersion\":99,\"id\":\"\(id)\"}".utf8)
    try futureManifest.write(to: manifestURL)

    let entries = store.pendingItems()
    XCTAssertEqual(entries, [.unsupportedVersion(itemId: id, schemaVersion: 99)])
    XCTAssertEqual(try Data(contentsOf: manifestURL), futureManifest)
    XCTAssertFalse(
      FileManager.default.fileExists(
        atPath: containerURL
          .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
          .appendingPathComponent(ShareInboxConstants.invalidDirectoryName)
          .appendingPathComponent("\(id).json").path
      )
    )
  }

  func testStorePreservesFutureManifestWithNonUUIDBasename() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("future-item.json")
    let futureManifest = Data("{\"schemaVersion\":99,\"id\":\"future-item\"}".utf8)
    try futureManifest.write(to: manifestURL)

    XCTAssertEqual(
      store.pendingItems(),
      [.unsupportedVersion(itemId: "future-item", schemaVersion: 99)]
    )
    XCTAssertEqual(try Data(contentsOf: manifestURL), futureManifest)
    XCTAssertTrue(FileManager.default.fileExists(atPath: manifestURL.path))
  }

  func testStoreDoesNotMutateFutureManifest() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let id = UUID().uuidString
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(id).json")
    let futureManifest = Data("{\"schemaVersion\":99,\"id\":\"\(id)\"}".utf8)
    try futureManifest.write(to: manifestURL)

    XCTAssertThrowsError(
      try store.update(
        ShareInboxItem(
          id: id,
          title: "Replacement",
          content: ShareInboxContent(kind: .text, url: nil, text: "replacement")
        )
      )
    )
    XCTAssertEqual(try Data(contentsOf: manifestURL), futureManifest)
  }

  func testStoreDoesNotReturnReadyWhenV1MigrationWriteFails() throws {
    let (_, containerURL) = try makeStore()
    let store = ShareInboxStore(
      fileManager: .default,
      containerURL: containerURL,
      writeData: { _, _, _ in throw TestWriteError.writeFailed }
    )
    XCTAssertTrue(store.ensureDirectories())
    let id = UUID().uuidString
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(id).json")
    let originalManifest = v1Manifest(id: id, documentId: UUID().uuidString)
    try originalManifest.write(to: manifestURL)

    XCTAssertTrue(store.pendingItems().isEmpty)
    XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
  }

  func testManifestTitleIgnoresPreviewAndOnlyAcceptsExplicitEdits() {
    let originalTitle = "Original Safari title"
    let serverPreviewTitle = "Untrusted server preview title"

    XCTAssertEqual(
      ShareInboxSafety.manifestTitle(original: originalTitle, userEdited: nil),
      originalTitle
    )
    XCTAssertNotEqual(
      ShareInboxSafety.manifestTitle(original: originalTitle, userEdited: nil),
      serverPreviewTitle
    )
    XCTAssertEqual(
      ShareInboxSafety.manifestTitle(
        original: originalTitle,
        userEdited: "  My explicit title  "
      ),
      "My explicit title"
    )
    XCTAssertEqual(
      ShareInboxSafety.previewTitle(
        original: originalTitle, userEdited: nil, serverTitle: serverPreviewTitle),
      serverPreviewTitle
    )
    XCTAssertEqual(
      ShareInboxSafety.previewTitle(
        original: originalTitle, userEdited: "My explicit title", serverTitle: serverPreviewTitle),
      "My explicit title"
    )
    XCTAssertEqual(
      ShareInboxSafety.manifestTitle(original: originalTitle, userEdited: nil),
      originalTitle
    )
  }

  func testShareExtensionActivationAcceptsSupportedRepresentationsAmongExtraAttachments() throws {
    let plistURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("ShareExtension/Info.plist")
    let plist = try PropertyListSerialization.propertyList(
      from: Data(contentsOf: plistURL),
      format: nil
    ) as? [String: Any]
    let extensionDictionary = plist?["NSExtension"] as? [String: Any]
    let attributes = extensionDictionary?["NSExtensionAttributes"] as? [String: Any]
    let rule = try XCTUnwrap(attributes?["NSExtensionActivationRule"] as? String)

    XCTAssertTrue(rule.contains("public.url"))
    XCTAssertTrue(rule.contains("public.text"))
    XCTAssertTrue(rule.contains("public.image"))
    XCTAssertTrue(rule.contains("com.apple.property-list"))
    XCTAssertTrue(rule.contains(".@count > 0"))
    XCTAssertFalse(rule.contains("TRUEPREDICATE"))

    let predicate = NSPredicate(format: rule)
    let youtubePayload: [String: Any] = [
      "extensionItems": [[
        "attachments": [
          ["registeredTypeIdentifiers": ["public.url", "public.data"]],
          ["registeredTypeIdentifiers": ["com.google.youtube.extra"]],
        ]
      ]]
    ]
    let unsupportedPayload: [String: Any] = [
      "extensionItems": [[
        "attachments": [[
          "registeredTypeIdentifiers": ["com.adobe.pdf", "public.movie"]
        ]]
      ]]
    ]
    XCTAssertTrue(predicate.evaluate(with: youtubePayload))
    XCTAssertFalse(predicate.evaluate(with: unsupportedPayload))
  }

  func testManifestIDsMustBeUUIDs() {
    let id = UUID().uuidString
    XCTAssertEqual(ShareInboxSafety.normalizedManifestID(id.lowercased()), id)
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("../item"))
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("nested/item"))
  }

  func testWebURLsRejectCredentialsAndUnsupportedSchemes() {
    XCTAssertEqual(
      ShareInboxSafety.normalizedWebURL("https://example.com/page"),
      "https://example.com/page"
    )
    XCTAssertNil(ShareInboxSafety.normalizedWebURL("file:///private/item"))
    XCTAssertNil(ShareInboxSafety.normalizedWebURL("https://user@example.com/page"))
  }

  func testSupportedImagesAreDetectedByContent() {
    XCTAssertEqual(
      ShareInboxSafety.detectRasterImageMimeType(Data([0xFF, 0xD8, 0xFF, 0x00])),
      "image/jpeg"
    )
    XCTAssertNil(ShareInboxSafety.detectRasterImageMimeType(Data("<svg/>".utf8)))
  }

  func testPreviewRouteMatrixAndAllowlistBypasses() {
    let publicURLs = [
      "https://x.com/affine/status/123",
      "https://www.twitter.com/affine/status/123",
      "https://youtu.be/video-id",
      "https://www.youtube.com/watch?v=video-id",
      "https://m.youtube.com/shorts/video-id",
    ]
    for mode in [ShareWorkspaceMode.selfHostedPresent, .cloudOnly, .signedOut, .unknown] {
      for url in publicURLs {
        XCTAssertEqual(ShareInboxSafety.previewRoute(mode: mode, url: url), .official)
      }
    }

    let genericURL = "https://example.com/private"
    XCTAssertEqual(ShareInboxSafety.previewRoute(mode: .selfHostedPresent, url: genericURL), .deferred)
    XCTAssertEqual(ShareInboxSafety.previewRoute(mode: .unknown, url: genericURL), .deferred)
    XCTAssertEqual(ShareInboxSafety.previewRoute(mode: .cloudOnly, url: genericURL), .official)
    XCTAssertEqual(ShareInboxSafety.previewRoute(mode: .signedOut, url: genericURL), .official)

    for bypass in [
      "https://evil.x.com/affine/status/123",
      "https://x.com/affine/status/not-a-number",
      "https://x.com/affine/status/123/extra",
      "https://youtube.com.evil.example/watch?v=video-id",
      "https://www.youtube.com/channel/video-id",
      "https://youtu.be/video-id/extra",
    ] {
      XCTAssertFalse(ShareInboxSafety.isOfficialPreviewURL(bypass), bypass)
    }
  }

  func testWorkspaceModeSnapshotFailsClosed() throws {
    XCTAssertEqual(ShareInboxSafety.workspaceMode(from: nil), .unknown)
    XCTAssertEqual(ShareInboxSafety.workspaceMode(from: Data("invalid".utf8)), .unknown)
    let incompatible = Data(
      "{\"mode\":\"cloudOnly\",\"schemaVersion\":2,\"updatedAt\":\"2026-08-27T00:00:00Z\"}".utf8
    )
    XCTAssertEqual(ShareInboxSafety.workspaceMode(from: incompatible), .unknown)

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let current = try encoder.encode(
      ShareWorkspaceModeSnapshot(mode: .selfHostedPresent, updatedAt: now)
    )
    XCTAssertEqual(ShareInboxSafety.workspaceMode(from: current, now: now), .selfHostedPresent)
    XCTAssertEqual(
      ShareInboxSafety.workspaceMode(from: current, now: now.addingTimeInterval(24 * 60 * 60 + 1)),
      .unknown
    )
  }

  func testOldManifestDefaultsToConservativeRouteAndOriginalURLSurvives() throws {
    let id = UUID().uuidString
    let oldManifest = """
      {
        "id":"\(id)",
        "documentId":"\(UUID().uuidString)",
        "createdAt":"2026-08-27T00:00:00Z",
        "title":"Original",
        "content":{"kind":"url","url":"https://example.com/original?token=value"},
        "attachments":[]
      }
      """
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let item = try decoder.decode(ShareInboxItem.self, from: Data(oldManifest.utf8))
    XCTAssertNil(item.previewRoute)
    XCTAssertEqual(item.previewRoute ?? .deferred, .deferred)
    XCTAssertEqual(item.content.url, "https://example.com/original?token=value")

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let encoded = try encoder.encode(item)
    XCTAssertEqual(try decoder.decode(ShareInboxItem.self, from: encoded).content.url, item.content.url)
  }

  func testPreviewAndImageRequestsCarryHeadersAndCanBeCancelled() async throws {
    let family = "👨‍👩‍👧"
    let transcript = ShareLinkPreview.Transcript(
      language: nil,
      segments: [
        .init(text: "  Hello\n\tworld  ", startSeconds: nil, durationSeconds: nil, speaker: nil),
        .init(text: "again", startSeconds: nil, durationSeconds: nil, speaker: nil),
      ],
      chapters: nil,
      truncated: nil
    )
    XCTAssertEqual(transcript.previewText, "Hello world again")
    let longTranscript = ShareLinkPreview.Transcript(
      language: nil,
      segments: [
        .init(
          text: String(repeating: family, count: 241), startSeconds: nil,
          durationSeconds: nil, speaker: nil)
      ],
      chapters: nil,
      truncated: nil
    )
    XCTAssertEqual(longTranscript.previewText?.count, 241)
    XCTAssertTrue(longTranscript.previewText?.hasSuffix("…") == true)

    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(
      session: URLSession(configuration: configuration), appVersion: "0.27.0")
    let started = expectation(description: "request started")
    let stopped = expectation(description: "request cancelled")
    SharePreviewURLProtocol.onStart = { _, request in
      XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"), "AFFiNE/0.27.0")
      XCTAssertEqual(request.value(forHTTPHeaderField: "x-affine-version"), "0.27.0")
      started.fulfill()
    }
    SharePreviewURLProtocol.onStop = { stopped.fulfill() }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    let task = Task {
      try await client.fetch(url: "https://www.youtube.com/watch?v=video-id")
    }
    await fulfillment(of: [started], timeout: 1)
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Cancelled preview unexpectedly completed")
    } catch {
      let urlError = error as? URLError
      XCTAssertTrue(error is CancellationError || urlError?.code == .cancelled)
    }
    await fulfillment(of: [stopped], timeout: 1)

    let imageData = try XCTUnwrap(
      Data(
        base64Encoded:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      )
    )
    let imageLoaded = expectation(description: "image loaded")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      XCTAssertEqual(request.httpMethod, "GET")
      XCTAssertEqual(request.url?.absoluteString, "https://app.affine.pro/api/worker/image-proxy")
      XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"), "AFFiNE/0.27.0")
      XCTAssertEqual(request.value(forHTTPHeaderField: "x-affine-version"), "0.27.0")
      let response = HTTPURLResponse(
        url: request.url!, statusCode: 200, httpVersion: nil,
        headerFields: ["Content-Type": "image/png"]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance, didReceive: response, cacheStoragePolicy: .notAllowed)
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: imageData)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
      imageLoaded.fulfill()
    }
    SharePreviewURLProtocol.onStop = nil
    _ = try await client.fetchImage(url: "/api/worker/image-proxy")
    await fulfillment(of: [imageLoaded], timeout: 1)

    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let response = HTTPURLResponse(
        url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
      protocolInstance.client?.urlProtocol(
        protocolInstance, didReceive: response, cacheStoragePolicy: .notAllowed)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
    }
    do {
      _ = try await client.fetchImage(url: "/api/worker/image-proxy")
      XCTFail("Failed image response unexpectedly decoded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .badServerResponse)
    }

    let imageStarted = expectation(description: "image request started")
    let imageStopped = expectation(description: "image request cancelled")
    SharePreviewURLProtocol.onStart = { _, request in
      XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"), "AFFiNE/0.27.0")
      XCTAssertEqual(request.value(forHTTPHeaderField: "x-affine-version"), "0.27.0")
      imageStarted.fulfill()
    }
    SharePreviewURLProtocol.onStop = { imageStopped.fulfill() }
    let imageTask = Task {
      try await client.fetchImage(url: "/api/worker/image-proxy")
    }
    await fulfillment(of: [imageStarted], timeout: 1)
    imageTask.cancel()
    do {
      _ = try await imageTask.value
      XCTFail("Cancelled image request unexpectedly completed")
    } catch {
      let urlError = error as? URLError
      XCTAssertTrue(error is CancellationError || urlError?.code == .cancelled)
    }
    await fulfillment(of: [imageStopped], timeout: 1)
  }
}

private enum TestWriteError: Error {
  case writeFailed
}
