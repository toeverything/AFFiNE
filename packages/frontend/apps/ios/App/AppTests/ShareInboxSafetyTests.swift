import UIKit
import UniformTypeIdentifiers
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
  func testSafariPagePayloadUsesCapturedContentAndTranscript() async throws {
    let item = NSExtensionItem()
    item.attachments = [
      NSItemProvider(
        item: [
          NSExtensionJavaScriptPreprocessingResultsKey: [
            "title": "Steak video",
            "url": "https://www.youtube.com/watch?v=YljWwZwlHQg",
            "content": "Gordon explains how to cook steak.",
            "description": "Steak description",
            "transcript": "0:35 Season the steak\n1:20 Sear the steak",
          ]
        ] as NSDictionary,
        typeIdentifier: UTType.propertyList.identifier
      )
    ]

    let draft = await SharePayloadBuilder.build(from: [item])

    XCTAssertNil(draft.errorMessage)
    XCTAssertEqual(draft.title, "Steak video")
    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://www.youtube.com/watch?v=YljWwZwlHQg")
    XCTAssertTrue(draft.content?.text?.contains("Gordon explains how to cook steak.") == true)
    XCTAssertEqual(draft.preview?.transcript?.segments.first?.startSeconds, 35)
    XCTAssertEqual(draft.preview?.transcript?.segments.first?.text, "Season the steak")
  }

  func testPDFFileShareExtractsImportableText() async throws {
    let item = NSExtensionItem()
    item.attachments = [
      NSItemProvider(
        item: makePDFData(text: "AFFiNE PDF body") as NSData,
        typeIdentifier: UTType.pdf.identifier
      )
    ]

    let draft = await SharePayloadBuilder.build(from: [item])

    XCTAssertNil(draft.errorMessage)
    XCTAssertEqual(draft.content?.kind, .text)
    XCTAssertEqual(draft.title, "Shared PDF")
    XCTAssertTrue(draft.content?.text?.contains("AFFiNE PDF body") == true)
  }

  func testRemotePDFURLTimeoutFallsBackToLink() async throws {
    let item = NSExtensionItem()
    item.attachments = [
      NSItemProvider(
        item: NSURL(string: "https://example.com/report.pdf")!,
        typeIdentifier: UTType.url.identifier
      )
    ]

    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let session = URLSession(configuration: configuration)
    let started = expectation(description: "remote PDF request started")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      XCTAssertEqual(request.url?.absoluteString, "https://example.com/report.pdf")
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/pdf"]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: Data("%PDF-".utf8))
      started.fulfill()
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
      session.invalidateAndCancel()
    }

    let task = Task {
      await SharePayloadBuilder.build(
        from: [item],
        remotePDFSession: session,
        remotePDFTimeout: 0.15
      )
    }
    await fulfillment(of: [started], timeout: 1)
    let draft = await task.value

    XCTAssertNil(draft.errorMessage)
    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://example.com/report.pdf")
    XCTAssertNil(draft.content?.text)
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
    XCTAssertTrue(rule.contains("com.adobe.pdf"))
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
          "registeredTypeIdentifiers": ["public.movie"]
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

  private func makePDFData(text: String) -> Data {
    let renderer = UIGraphicsPDFRenderer(
      bounds: CGRect(x: 0, y: 0, width: 320, height: 240)
    )
    return renderer.pdfData { context in
      context.beginPage()
      text.draw(
        at: CGPoint(x: 24, y: 24),
        withAttributes: [.font: UIFont.systemFont(ofSize: 18)]
      )
    }
  }
}
