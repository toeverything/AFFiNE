import XCTest
import UIKit
import UniformTypeIdentifiers

private final class SharePreviewURLProtocol: URLProtocol {
  static var onStart: ((SharePreviewURLProtocol, URLRequest) -> Void)?
  static var onStop: (() -> Void)?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() { Self.onStart?(self, request) }
  override func stopLoading() { Self.onStop?() }
}

private func sharePreviewRequestBody(_ request: URLRequest) -> Data? {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { return nil }
  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 4_096)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    guard count >= 0 else { return nil }
    if count == 0 { break }
    data.append(buffer, count: count)
  }
  return data
}

private func sharePreviewPNGData(width: Int = 1, height: Int = 1) -> Data {
  let format = UIGraphicsImageRendererFormat.default()
  format.scale = 1
  let renderer = UIGraphicsImageRenderer(
    size: CGSize(width: width, height: height),
    format: format
  )
  return renderer.pngData { context in
    UIColor.red.setFill()
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  }
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

  private func v2Manifest(
    id: String,
    documentId: String,
    importAttemptId: String
  ) -> Data {
    Data(
      """
      {
        "schemaVersion":2,
        "importAttemptId":"\(importAttemptId)",
        "id":"\(id)",
        "documentId":"\(documentId)",
        "createdAt":"2026-08-27T00:00:00Z",
        "title":"Original",
        "content":{"kind":"url","url":"https://example.com/original"},
        "target":{
          "workspaceId":"workspace-id",
          "workspaceFlavour":"local",
          "tagIds":["tag-a","tag-b"],
          "collectionId":"collection-id"
        },
        "previewText":"Original preview",
        "attachments":[],
        "lastError":"retry-me"
      }
      """.utf8
    )
  }

  private func makeImageData(size: Int = 256 * 1024) -> Data {
    var data = Data([0xFF, 0xD8, 0xFF, 0xE0])
    data.append(Data(repeating: 0x42, count: size - data.count))
    return data
  }

  private func makePNGData(size: Int = 64 * 1024) -> Data {
    var data = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    data.append(Data(repeating: 0x50, count: size - data.count))
    return data
  }

  private func makePDFData(size: Int = 64 * 1024) -> Data {
    var data = Data("%PDF-1.7\n".utf8)
    data.append(Data(repeating: 0x20, count: size - data.count))
    return data
  }

  private func makeProviderFile(data: Data? = nil, name: String = "provider-image.jpg") throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("ShareInboxProviderTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    addTeardownBlock {
      try? FileManager.default.removeItem(at: directory)
    }
    let url = directory.appendingPathComponent(name)
    try (data ?? makeImageData()).write(to: url)
    return url
  }

  private func makeDraft(
    stagingURL: URL,
    name: String = "shared-image.jpg",
    title: String = "Shared image"
  ) -> SharePayloadDraft {
    SharePayloadDraft(
      title: title,
      content: ShareInboxContent(kind: .image, url: nil, text: nil),
      previewText: "shared-image",
      file: SharePayloadFile(
        ownedStagingURL: stagingURL,
        name: name,
        mimeType: "image/jpeg",
        size: (try? Data(contentsOf: stagingURL).count) ?? 0,
        thumbnailData: Data([0xFF, 0xD8, 0xFF])
      ),
      errorMessage: nil
    )
  }

  func testBuilderStagesProviderFileBeforeTheProviderDisappears() throws {
    let source = try makeProviderFile()
    let expected = try Data(contentsOf: source)

    let file = try SharePayloadBuilder.stageImage(from: source, suggestedName: source.lastPathComponent)
    try FileManager.default.removeItem(at: source)

    XCTAssertTrue(file.ownedStagingURL.path.hasPrefix(ShareInboxConstants.stagingDirectoryURL.path))
    XCTAssertEqual(try Data(contentsOf: file.ownedStagingURL), expected)
    XCTAssertEqual(file.size, expected.count)
    XCTAssertLessThanOrEqual(file.thumbnailData.count, ShareInboxConstants.maxThumbnailBytes)
  }

  func testRichPreviewDecodesProviderMetadataAndFormatsTranscript() throws {
    let data = Data(
      #"""
      {
        "url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "images":["https://app.affine.pro/api/worker/image-proxy?url=thumbnail"],
        "favicons":["https://app.affine.pro/api/worker/image-proxy?url=favicon"],
        "provider":"youtube",
        "siteName":"YouTube",
        "title":"Rick Astley - Never Gonna Give You Up",
        "description":"The official video",
        "author":{"name":"Rick Astley"},
        "durationSeconds":214,
        "transcript":{"language":"en","segments":[
          {"text":"  We're no strangers\n to love  ","startSeconds":18.64},
          {"text":"You know the rules and so do I","startSeconds":22.64}
        ]}
      }
      """#.utf8
    )

    let preview = try JSONDecoder().decode(ShareLinkPreview.self, from: data)

    XCTAssertEqual(preview.provider, "youtube")
    XCTAssertEqual(preview.author?.name, "Rick Astley")
    XCTAssertEqual(preview.formattedDuration, "3:34")
    XCTAssertEqual(
      preview.transcript?.previewText,
      "We're no strangers to love You know the rules and so do I"
    )
    XCTAssertNotNil(preview.persistable())
  }

  func testPersistablePreviewTruncatesTranscriptToTheEncodedLimit() throws {
    let preview = ShareLinkPreview(
      url: "https://www.youtube.com/watch?v=video-id",
      title: "Video",
      siteName: "YouTube",
      description: "Description",
      images: ["https://app.affine.pro/api/worker/image-proxy?url=thumbnail"],
      favicons: ["https://app.affine.pro/api/worker/image-proxy?url=favicon"],
      mediaType: "video.movie",
      provider: "youtube",
      author: .init(name: "Author", handle: nil, avatar: nil),
      publishedAt: nil,
      durationSeconds: 214,
      transcript: .init(
        language: "zh-CN",
        segments: (0..<100).map { index in
          .init(
            text: "\(index) " + String(repeating: "中", count: 4_000),
            startSeconds: Double(index),
            durationSeconds: 1,
            speaker: nil
          )
        },
        chapters: nil,
        truncated: nil
      )
    )

    let persisted = try XCTUnwrap(preview.persistable())
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let encoded = try encoder.encode(persisted)

    XCTAssertLessThanOrEqual(encoded.count, ShareLinkPreview.maxPersistedBytes)
    XCTAssertLessThan(persisted.transcript?.segments.count ?? 0, 100)
    XCTAssertEqual(persisted.transcript?.truncated, true)
  }

  func testPersistablePreviewRejectsInvalidSourceAndFiltersNonProxyMedia() throws {
    let invalidSource = ShareLinkPreview(
      url: "https://user@example.com/private",
      title: "Private"
    )
    XCTAssertNil(invalidSource.persistable())

    let preview = ShareLinkPreview(
      url: "https://example.com/article",
      title: String(repeating: "👨‍👩‍👧", count: 600),
      images: [
        "https://example.com/direct.png",
        "https://app.affine.pro/not-image-proxy",
        "https://app.affine.pro/api/worker/image-proxy?url=allowed",
      ],
      favicons: ["file:///private/favicon.png"]
    )
    let persisted = try XCTUnwrap(preview.persistable())

    XCTAssertLessThanOrEqual(persisted.title?.utf8.count ?? 0, 4_096)
    XCTAssertEqual(
      persisted.images,
      ["https://app.affine.pro/api/worker/image-proxy?url=allowed"]
    )
    XCTAssertEqual(persisted.favicons, [])
  }

  func testPersistablePreviewTruncatesUnicodeAtAnExactUTF8Boundary() throws {
    let preview = ShareLinkPreview(
      url: "https://example.com/article",
      title: String(repeating: "中", count: 1_364) + "abcdz"
    )

    let persisted = try XCTUnwrap(preview.persistable())

    XCTAssertEqual(persisted.title?.utf8.count, 4_096)
    XCTAssertEqual(persisted.title?.suffix(4), "abcd")
  }

  func testPreviewClientSendsOfficialRequestAndDecodesBoundedResponse() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let requested = expectation(description: "preview requested")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      XCTAssertEqual(request.url, ShareInboxConstants.officialLinkPreviewURL)
      XCTAssertEqual(request.httpMethod, "POST")
      XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
      XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"), "AFFiNE/0.27.0")
      XCTAssertEqual(request.value(forHTTPHeaderField: "x-affine-version"), "0.27.0")
      let body = try? XCTUnwrap(sharePreviewRequestBody(request)).flatMap {
        try JSONSerialization.jsonObject(with: $0) as? [String: Any]
      }
      XCTAssertEqual(body?["url"] as? String, "https://www.youtube.com/watch?v=video-id")
      XCTAssertEqual(body?["include"] as? [String], ["transcript"])

      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      let data = Data(
        #"{"url":"https://www.youtube.com/watch?v=video-id","provider":"youtube","title":"Video"}"#.utf8
      )
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: data)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
      requested.fulfill()
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    let preview = try await client.fetch(url: "https://www.youtube.com/watch?v=video-id")

    XCTAssertEqual(preview.provider, "youtube")
    XCTAssertEqual(preview.title, "Video")
    await fulfillment(of: [requested], timeout: 1)
  }

  func testPreviewClientCancelsFalseSmallContentLengthAtTheByteLimit() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let stopped = expectation(description: "oversized request stopped")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: [
          "Content-Type": "application/json",
          "Content-Length": "1",
        ]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didLoad: Data(repeating: 0x20, count: ShareLinkPreview.maxResponseBytes + 1)
      )
    }
    SharePreviewURLProtocol.onStop = { stopped.fulfill() }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetch(url: "https://example.com/large")
      XCTFail("Oversized response unexpectedly decoded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .dataLengthExceedsMaximum)
    }
    await fulfillment(of: [stopped], timeout: 1)
  }

  func testPreviewClientRejectsJSONLikeButInvalidMIMEType() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/jsonp"]
      )!
      let data = Data(#"{"url":"https://example.com/article"}"#.utf8)
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: data)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetch(url: "https://example.com/article")
      XCTFail("Invalid JSON MIME unexpectedly accepted")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .badServerResponse)
    }
  }

  func testPreviewClientPropagatesTaskCancellation() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let started = expectation(description: "preview started")
    let stopped = expectation(description: "preview stopped")
    SharePreviewURLProtocol.onStart = { _, _ in started.fulfill() }
    SharePreviewURLProtocol.onStop = { stopped.fulfill() }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    let task = Task {
      try await client.fetch(url: "https://example.com/cancel")
    }
    await fulfillment(of: [started], timeout: 1)
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Cancelled request unexpectedly completed")
    } catch {
      let code = (error as? URLError)?.code
      XCTAssertTrue(error is CancellationError || code == .cancelled)
    }
    await fulfillment(of: [stopped], timeout: 1)
  }

  func testPreviewClientDoesNotStartAnAlreadyCancelledRequest() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    SharePreviewURLProtocol.onStart = { _, _ in
      XCTFail("An already cancelled request should not start loading")
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    let task = Task {
      while !Task.isCancelled {
        await Task.yield()
      }
      return try await client.fetch(url: "https://example.com/cancelled-before-fetch")
    }
    task.cancel()

    do {
      _ = try await task.value
      XCTFail("Already cancelled request unexpectedly completed")
    } catch {
      let code = (error as? URLError)?.code
      XCTAssertTrue(error is CancellationError || code == .cancelled)
    }
  }

  func testPreviewClientLoadsBoundedImageFromOfficialProxy() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let imageURL = "https://app.affine.pro/api/worker/image-proxy?url=thumbnail"
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      XCTAssertEqual(request.url?.absoluteString, imageURL)
      let data = sharePreviewPNGData(width: 2, height: 3)
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: [
          "Content-Type": "image/png",
          "Content-Length": String(data.count),
        ]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: data)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    let image = try await client.fetchImage(url: imageURL)

    XCTAssertEqual(image.size.width, 2)
    XCTAssertEqual(image.size.height, 3)
  }

  func testPreviewClientRejectsImageOutsideOfficialProxyWithoutRequestingIt() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    SharePreviewURLProtocol.onStart = { _, _ in
      XCTFail("Non-proxy image URL should not reach the network")
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetchImage(url: "https://example.com/thumbnail.png")
      XCTFail("Non-proxy image URL unexpectedly loaded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .badURL)
    }
  }

  func testPreviewClientRejectsNonImageMediaResponse() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let imageURL = "https://app.affine.pro/api/worker/image-proxy?url=thumbnail"
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "text/html"]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: Data("not an image".utf8))
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetchImage(url: imageURL)
      XCTFail("Non-image response unexpectedly decoded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .cannotDecodeContentData)
    }
  }

  func testPreviewClientCancelsFalseSmallMediaResponseAtTheByteLimit() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let imageURL = "https://app.affine.pro/api/worker/image-proxy?url=thumbnail"
    let stopped = expectation(description: "oversized media request stopped")
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: [
          "Content-Type": "image/png",
          "Content-Length": "1",
        ]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didLoad: Data(repeating: 0x20, count: ShareLinkPreview.maxMediaBytes + 1)
      )
    }
    SharePreviewURLProtocol.onStop = { stopped.fulfill() }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetchImage(url: imageURL)
      XCTFail("Oversized media response unexpectedly decoded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .dataLengthExceedsMaximum)
    }
    await fulfillment(of: [stopped], timeout: 1)
  }

  func testPreviewClientRejectsImageDimensionAboveLimit() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SharePreviewURLProtocol.self]
    let client = ShareLinkPreviewClient(configuration: configuration, appVersion: "0.27.0")
    let imageURL = "https://app.affine.pro/api/worker/image-proxy?url=thumbnail"
    SharePreviewURLProtocol.onStart = { protocolInstance, request in
      let data = sharePreviewPNGData(width: ShareLinkPreview.maxMediaDimension + 1)
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "image/png"]
      )!
      protocolInstance.client?.urlProtocol(
        protocolInstance,
        didReceive: response,
        cacheStoragePolicy: .notAllowed
      )
      protocolInstance.client?.urlProtocol(protocolInstance, didLoad: data)
      protocolInstance.client?.urlProtocolDidFinishLoading(protocolInstance)
    }
    defer {
      SharePreviewURLProtocol.onStart = nil
      SharePreviewURLProtocol.onStop = nil
    }

    do {
      _ = try await client.fetchImage(url: imageURL)
      XCTFail("Oversized image dimensions unexpectedly decoded")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .cannotDecodeContentData)
    }
  }

  func testBuilderStagesAValidPDFBeforeTheProviderDisappears() throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let expected = try Data(contentsOf: source)

    let file = try SharePayloadBuilder.stagePDF(
      from: source,
      suggestedName: source.lastPathComponent,
      declaredTypeIdentifier: UTType.pdf.identifier
    )
    try FileManager.default.removeItem(at: source)

    XCTAssertEqual(file.mimeType, "application/pdf")
    XCTAssertEqual(file.size, expected.count)
    XCTAssertEqual(try Data(contentsOf: file.ownedStagingURL), expected)
    XCTAssertLessThanOrEqual(file.thumbnailData.count, ShareInboxConstants.maxThumbnailBytes)
  }

  func testBuilderRejectsPDFWithSpoofedDeclaredType() throws {
    let source = try makeProviderFile(data: makePDFData(), name: "spoofed.pdf")

    XCTAssertThrowsError(
      try SharePayloadBuilder.stagePDF(
        from: source,
        suggestedName: source.lastPathComponent,
        declaredTypeIdentifier: UTType.jpeg.identifier
      )
    )
  }

  func testBuilderRejectsPDFWithoutPDFMagic() throws {
    let source = try makeProviderFile(data: Data("not a PDF".utf8), name: "report.pdf")

    XCTAssertThrowsError(
      try SharePayloadBuilder.stagePDF(
        from: source,
        suggestedName: source.lastPathComponent,
        declaredTypeIdentifier: UTType.pdf.identifier
      )
    )
  }

  func testBuilderRejectsEmptyPDF() throws {
    let source = try makeProviderFile(data: Data(), name: "empty.pdf")

    XCTAssertThrowsError(
      try SharePayloadBuilder.stagePDF(
        from: source,
        suggestedName: source.lastPathComponent,
        declaredTypeIdentifier: UTType.pdf.identifier
      )
    )
  }

  func testBuilderRejectsPDFLargerThanShareAttachmentLimit() throws {
    let source = try makeProviderFile(data: makePDFData(), name: "large.pdf")
    let handle = try FileHandle(forWritingTo: source)
    try handle.seek(toOffset: UInt64(64 * 1024 * 1024))
    try handle.write(contentsOf: Data([0]))
    try handle.close()

    XCTAssertThrowsError(
      try SharePayloadBuilder.stagePDF(
        from: source,
        suggestedName: source.lastPathComponent,
        declaredTypeIdentifier: UTType.pdf.identifier
      )
    ) { error in
      XCTAssertEqual(error as? ShareInboxError, .payloadTooLarge)
    }
  }

  func testBuilderKeepsAValidPDFWhenThumbnailRenderingFails() throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")

    let file = try SharePayloadBuilder.stagePDF(
      from: source,
      suggestedName: source.lastPathComponent,
      declaredTypeIdentifier: UTType.pdf.identifier,
      renderThumbnail: { _ in throw TestThumbnailError.failed }
    )

    XCTAssertEqual(file.mimeType, "application/pdf")
    XCTAssertTrue(file.thumbnailData.isEmpty)
  }

  func testBuilderRejectsMultipleBinaryAttachmentsBeforeEnqueue() async {
    let first = NSItemProvider()
    var didLoadFirst = false
    first.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadFirst = true
      completion(nil, false, ShareInboxError.invalidPayload)
      return nil
    }
    let second = NSItemProvider()
    var didLoadSecond = false
    second.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadSecond = true
      completion(nil, false, ShareInboxError.invalidPayload)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [first, second]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertNil(draft.content)
    XCTAssertEqual(draft.errorMessage, "Share one image or PDF at a time.")
    XCTAssertFalse(didLoadFirst)
    XCTAssertFalse(didLoadSecond)
  }

  func testBuilderStopsWaitingForPendingProviderLoadWhenTaskIsCancelled() async {
    let started = expectation(description: "provider load started")
    let finished = expectation(description: "builder stopped waiting")
    let provider = NSItemProvider()
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.plainText.identifier,
      visibility: .all
    ) { completion in
      started.fulfill()
      DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
        completion(Data("late provider result".utf8), nil)
      }
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let task = Task {
      let draft = await SharePayloadBuilder.build(from: [extensionItem])
      finished.fulfill()
      return draft
    }
    await fulfillment(of: [started], timeout: 1)
    task.cancel()
    await fulfillment(of: [finished], timeout: 0.1)
    _ = await task.value
  }

  func testBuilderCancelsPendingFileProviderProgressWhenTaskIsCancelled() async throws {
    let started = expectation(description: "file provider load started")
    let cancelled = expectation(description: "file provider load cancelled")
    let source = try makeProviderFile(data: makePDFData(), name: "cancelled.pdf")
    let provider = NSItemProvider()
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      let progress = Progress(totalUnitCount: 1)
      progress.cancellationHandler = {
        cancelled.fulfill()
        completion(nil, false, CancellationError())
      }
      started.fulfill()
      DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
        guard !progress.isCancelled else { return }
        completion(source, true, nil)
      }
      return progress
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let task = Task {
      await SharePayloadBuilder.build(from: [extensionItem])
    }
    await fulfillment(of: [started], timeout: 1)
    task.cancel()
    await fulfillment(of: [cancelled], timeout: 0.1)
    _ = await task.value
  }

  func testBuilderRejectsAnImageAndPDFBeforeAnyBinaryLoad() async {
    let image = NSItemProvider()
    let imageData = makePNGData()
    var didLoadImage = false
    image.registerDataRepresentation(
      forTypeIdentifier: UTType.png.identifier,
      visibility: .all
    ) { completion in
      didLoadImage = true
      completion(imageData, nil)
      return nil
    }
    let pdf = NSItemProvider()
    var didLoadPDF = false
    pdf.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(nil, false, ShareInboxError.invalidPayload)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [image, pdf]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertNil(draft.content)
    XCTAssertEqual(draft.errorMessage, "Share one image or PDF at a time.")
    XCTAssertFalse(didLoadImage)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderTreatsRemotePDFURLAsAURLShare() async {
    let provider = NSItemProvider(object: URL(string: "https://example.com/report.pdf")! as NSURL)
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://example.com/report.pdf")
    XCTAssertNil(draft.file)
  }

  func testBuilderDoesNotLoadPDFRepresentationForARemotePDFURL() async throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let provider = NSItemProvider(object: URL(string: "https://example.com/report.pdf")! as NSURL)
    var didLoadPDF = false
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(source, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertNil(draft.file)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderDoesNotLoadBinaryRepresentationsForARemotePDFURL() async throws {
    let pdf = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let provider = NSItemProvider(object: URL(string: "https://example.com/report.pdf")! as NSURL)
    var didLoadImage = false
    var didLoadPDF = false
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.png.identifier,
      visibility: .all
    ) { completion in
      didLoadImage = true
      completion(self.makePNGData(), nil)
      return nil
    }
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(pdf, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://example.com/report.pdf")
    XCTAssertNil(draft.file)
    XCTAssertFalse(didLoadImage)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderDoesNotLoadPDFWhenDeclaredURLRepresentationFails() async throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let provider = NSItemProvider()
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.url.identifier,
      visibility: .all
    ) { completion in
      completion(nil, ShareInboxError.invalidPayload)
      return nil
    }
    var didLoadPDF = false
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(source, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertNil(draft.file)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderLoadsPDFWhenURLRepresentationIsALocalFile() async throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let provider = NSItemProvider(object: source as NSURL)
    var didLoadPDF = false
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(source, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .pdf)
    XCTAssertEqual(draft.file?.mimeType, "application/pdf")
    XCTAssertTrue(didLoadPDF)
  }

  func testBuilderTreatsProviderWithURLAndPDFAsURLAfterAnotherURL() async throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let first = NSItemProvider(object: URL(string: "https://example.com/first")! as NSURL)
    let second = NSItemProvider(object: URL(string: "https://example.com/report.pdf")! as NSURL)
    var didLoadPDF = false
    second.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(source, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [first, second]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://example.com/first")
    XCTAssertNil(draft.file)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderDoesNotLoadSeparatePDFProviderWhenShareContainsRemoteURL() async throws {
    let source = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let remoteURL = NSItemProvider(
      object: URL(string: "https://example.com/report.pdf")! as NSURL
    )
    let pdf = NSItemProvider()
    var didLoadPDF = false
    pdf.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadPDF = true
      completion(source, true, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [remoteURL, pdf]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .url)
    XCTAssertEqual(draft.content?.url, "https://example.com/report.pdf")
    XCTAssertNil(draft.file)
    XCTAssertFalse(didLoadPDF)
  }

  func testBuilderRejectsTwoLocalPDFsEvenWhenShareContainsAURL() async {
    let remoteURL = NSItemProvider(object: URL(string: "https://example.com")! as NSURL)
    let first = NSItemProvider()
    let second = NSItemProvider()
    var didLoadFirst = false
    var didLoadSecond = false
    first.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadFirst = true
      completion(nil, false, ShareInboxError.invalidPayload)
      return nil
    }
    second.registerFileRepresentation(
      forTypeIdentifier: UTType.pdf.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadSecond = true
      completion(nil, false, ShareInboxError.invalidPayload)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [remoteURL, first, second]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertNil(draft.content)
    XCTAssertEqual(draft.errorMessage, "Share one image or PDF at a time.")
    XCTAssertFalse(didLoadFirst)
    XCTAssertFalse(didLoadSecond)
  }

  func testBuilderRemovesTemporaryDirectoryWhenProviderCopyIsInterrupted() throws {
    let source = try makeProviderFile()
    try FileManager.default.createDirectory(
      at: ShareInboxConstants.stagingDirectoryURL,
      withIntermediateDirectories: true
    )
    let before = try Set(FileManager.default.contentsOfDirectory(
      atPath: ShareInboxConstants.stagingDirectoryURL.path
    ))

    XCTAssertThrowsError(
      try SharePayloadBuilder.stageImage(
        from: source,
        suggestedName: source.lastPathComponent,
        copyFile: { _, _ in throw TestCopyError.interrupted }
      )
    )

    let after = try Set(FileManager.default.contentsOfDirectory(
      atPath: ShareInboxConstants.stagingDirectoryURL.path
    ))
    XCTAssertEqual(after, before)
  }

  func testBuilderLeavesNoStagingDirectoryWhenCoordinatedReadFails() throws {
    let source = try makeProviderFile()
    try FileManager.default.createDirectory(
      at: ShareInboxConstants.stagingDirectoryURL,
      withIntermediateDirectories: true
    )
    let before = try Set(FileManager.default.contentsOfDirectory(
      atPath: ShareInboxConstants.stagingDirectoryURL.path
    ))

    XCTAssertThrowsError(
      try SharePayloadBuilder.stageImage(
        from: source,
        suggestedName: source.lastPathComponent,
        coordinatedRead: { _, _ in throw TestCopyError.interrupted }
      )
    )

    XCTAssertEqual(
      try Set(FileManager.default.contentsOfDirectory(atPath: ShareInboxConstants.stagingDirectoryURL.path)),
      before
    )
  }

  func testBuilderUsesCoordinatedURLForImageMetadataAndContents() throws {
    let original = try makeProviderFile(name: "original.jpg")
    let coordinated = try makeProviderFile(data: makePNGData(), name: "changed.png")

    let staged = try SharePayloadBuilder.stageImage(
      from: original,
      suggestedName: original.lastPathComponent,
      coordinatedRead: { _, read in try read(coordinated) }
    )

    XCTAssertEqual(staged.mimeType, "image/png")
    XCTAssertEqual(staged.size, try Data(contentsOf: coordinated).count)
    XCTAssertEqual(try Data(contentsOf: staged.ownedStagingURL), try Data(contentsOf: coordinated))
  }

  func testBuilderRemovesStagingDirectoriesOlderThanOneDay() throws {
    let staleDirectory = ShareInboxConstants.stagingDirectoryURL
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: staleDirectory, withIntermediateDirectories: true)
    try FileManager.default.setAttributes(
      [.modificationDate: Date.now.addingTimeInterval(-ShareInboxConstants.stagingMaxAge - 1)],
      ofItemAtPath: staleDirectory.path
    )

    _ = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "fresh.jpg"),
      suggestedName: "fresh.jpg"
    )

    XCTAssertFalse(FileManager.default.fileExists(atPath: staleDirectory.path))
  }

  func testStoreRejectsTraversalAttachmentPathBeforePublishingManifest() throws {
    let (store, containerURL) = try makeStore()
    let source = try makeProviderFile()
    let item = ShareInboxItem(
      title: "Image",
      content: ShareInboxContent(kind: .image, url: nil, text: nil),
      attachments: [
        ShareInboxAttachment(
          fileName: "image.jpg",
          mimeType: "image/jpeg",
          relativePath: "../image.jpg"
        )
      ]
    )

    XCTAssertThrowsError(
      try store.enqueue(item, attachmentFiles: [(item.attachments[0], source)])
    )
    XCTAssertFalse(FileManager.default.fileExists(
      atPath: containerURL
        .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
        .appendingPathComponent("\(item.id).json").path
    ))
  }

  func testStorePublishesManifestOnlyAfterFileCopyCompletes() throws {
    let (_, containerURL) = try makeStore()
    let source = try makeProviderFile()
    var item = ShareInboxItem(
      title: "Image",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachment = ShareInboxAttachment(
      fileName: "image.jpg",
      mimeType: "image/jpeg",
      relativePath: "\(item.id)/image.jpg"
    )
    item.attachments = [attachment]
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
      .appendingPathComponent("\(item.id).json")
    var manifestWasVisibleDuringCopy = false
    let store = ShareInboxStore(
      fileManager: .default,
      containerURL: containerURL,
      copyFile: { _, destination in
        manifestWasVisibleDuringCopy = FileManager.default.fileExists(atPath: manifestURL.path)
        try Data([0xFF, 0xD8, 0xFF]).write(to: destination)
      }
    )

    try store.enqueue(item, attachmentFiles: [(attachment, source)])

    XCTAssertFalse(manifestWasVisibleDuringCopy)
    XCTAssertTrue(FileManager.default.fileExists(atPath: manifestURL.path))
    XCTAssertEqual(try Data(contentsOf: try XCTUnwrap(store.attachmentURL(for: attachment))), Data([0xFF, 0xD8, 0xFF]))
  }

  func testStoreRemovesStaleTemporaryAndManifestlessAttachmentDirectories() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let attachmentsDirectory = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent(ShareInboxConstants.attachmentsDirectoryName, isDirectory: true)
    let staleTemporary = attachmentsDirectory
      .appendingPathComponent(".\(UUID().uuidString).tmp", isDirectory: true)
    let stalePublished = attachmentsDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let freshTemporary = attachmentsDirectory
      .appendingPathComponent(".\(UUID().uuidString).tmp", isDirectory: true)
    for directory in [staleTemporary, stalePublished, freshTemporary] {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
    }
    let staleDate = Date.now.addingTimeInterval(-ShareInboxConstants.stagingMaxAge - 1)
    for directory in [staleTemporary, stalePublished] {
      try FileManager.default.setAttributes(
        [.modificationDate: staleDate],
        ofItemAtPath: directory.path
      )
    }

    _ = store.pendingItems()

    XCTAssertFalse(FileManager.default.fileExists(atPath: staleTemporary.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: stalePublished.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: freshTemporary.path))
  }

  func testStoreDoesNotLeaveAttachmentDirectoryForTextItemAfterRemove() throws {
    let (store, containerURL) = try makeStore()
    let item = ShareInboxItem(
      title: "Shared text",
      content: ShareInboxContent(kind: .text, url: nil, text: "Hello")
    )
    let attachmentDirectory = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
      .appendingPathComponent(ShareInboxConstants.attachmentsDirectoryName)
      .appendingPathComponent(item.id, isDirectory: true)

    try store.enqueue(item)
    XCTAssertFalse(FileManager.default.fileExists(atPath: attachmentDirectory.path))
    try store.remove(item)
    XCTAssertFalse(FileManager.default.fileExists(atPath: attachmentDirectory.path))
  }

  func testStoreCompletionRejectsMismatchedDocumentAndPreservesAdjacentItem() throws {
    let (store, _) = try makeStore()
    let itemId = "00000000-0000-4000-8000-00000000000A"
    let adjacentId = "00000000-0000-4000-8000-00000000000B"
    let item = ShareInboxItem(
      id: itemId,
      documentId: "document-a",
      title: "First",
      content: ShareInboxContent(kind: .text, url: nil, text: "First")
    )
    let adjacent = ShareInboxItem(
      id: adjacentId,
      documentId: "document-b",
      title: "Second",
      content: ShareInboxContent(kind: .text, url: nil, text: "Second")
    )
    try store.enqueue(item)
    try store.enqueue(adjacent)

    XCTAssertThrowsError(
      try store.complete(
        itemId: item.id,
        docId: adjacent.documentId,
        committedAt: Date(timeIntervalSince1970: 1_800_000_000)
      )
    )

    let pending = store.pendingItems().compactMap { entry -> ShareInboxItem? in
      guard case let .ready(item) = entry else { return nil }
      return item
    }
    XCTAssertEqual(Set(pending.map(\.id)), Set([item.id, adjacent.id]))
    XCTAssertTrue(pending.allSatisfy { $0.result == nil })
  }

  func testStoreCompletionRemovesOnlyMatchingOwnedFilesAfterRecordingResult() throws {
    let (store, containerURL) = try makeStore()
    let itemId = "00000000-0000-4000-8000-00000000000a"
    let adjacentId = "00000000-0000-4000-8000-00000000000b"
    let sourceA = try makeProviderFile(name: "first.jpg")
    let sourceB = try makeProviderFile(name: "second.jpg")
    var item = ShareInboxItem(
      id: itemId,
      documentId: "document-a",
      title: "First",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachmentA = ShareInboxAttachment(
      fileName: "first.jpg",
      mimeType: "image/jpeg",
      relativePath: "\(item.id)/first.jpg"
    )
    item.attachments = [attachmentA]
    var adjacent = ShareInboxItem(
      id: adjacentId,
      documentId: "document-b",
      title: "Second",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachmentB = ShareInboxAttachment(
      fileName: "second.jpg",
      mimeType: "image/jpeg",
      relativePath: "\(adjacent.id)/second.jpg"
    )
    adjacent.attachments = [attachmentB]
    try store.enqueue(item, attachmentFiles: [(attachmentA, sourceA)])
    try store.enqueue(adjacent, attachmentFiles: [(attachmentB, sourceB)])

    try store.complete(
      itemId: item.id,
      docId: item.documentId,
      committedAt: Date(timeIntervalSince1970: 1_800_000_000)
    )

    let inbox = containerURL.appendingPathComponent(
      ShareInboxConstants.inboxDirectoryName
    )
    let attachments = inbox.appendingPathComponent(
      ShareInboxConstants.attachmentsDirectoryName
    )
    let itemManifestId = try XCTUnwrap(
      ShareInboxSafety.normalizedManifestID(item.id)
    )
    let adjacentManifestId = try XCTUnwrap(
      ShareInboxSafety.normalizedManifestID(adjacent.id)
    )
    XCTAssertFalse(FileManager.default.fileExists(
      atPath: inbox.appendingPathComponent("\(itemManifestId).json").path
    ))
    XCTAssertFalse(FileManager.default.fileExists(
      atPath: attachments.appendingPathComponent(item.id).path
    ))
    XCTAssertTrue(FileManager.default.fileExists(
      atPath: inbox.appendingPathComponent("\(adjacentManifestId).json").path
    ))
    XCTAssertTrue(FileManager.default.fileExists(
      atPath: attachments.appendingPathComponent(adjacent.id).path
    ))
  }

  func testStoreCompletionMarkerSurvivesCleanupFailureAndPendingEnumerationRetriesCleanup() throws {
    let itemId = "00000000-0000-4000-8000-00000000000a"
    let adjacentId = "00000000-0000-4000-8000-00000000000b"
    let containerURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("ShareInboxSafetyTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)
    addTeardownBlock {
      try? FileManager.default.removeItem(at: containerURL)
    }
    let targetAttachmentDirectory = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
      .appendingPathComponent(ShareInboxConstants.attachmentsDirectoryName)
      .appendingPathComponent(itemId, isDirectory: true)
    var failTargetCleanup = true
    let store = ShareInboxStore(
      fileManager: .default,
      containerURL: containerURL,
      removeItem: { url in
        if failTargetCleanup,
           url.standardizedFileURL == targetAttachmentDirectory.standardizedFileURL
        {
          failTargetCleanup = false
          throw TestCopyError.interrupted
        }
        try FileManager.default.removeItem(at: url)
      }
    )
    let sourceA = try makeProviderFile(name: "first.jpg")
    let sourceB = try makeProviderFile(name: "second.jpg")
    var item = ShareInboxItem(
      id: itemId,
      documentId: "document-a",
      title: "First",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachmentA = ShareInboxAttachment(
      fileName: "first.jpg",
      mimeType: "image/jpeg",
      relativePath: "\(item.id)/first.jpg"
    )
    item.attachments = [attachmentA]
    var adjacent = ShareInboxItem(
      id: adjacentId,
      documentId: "document-b",
      title: "Second",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachmentB = ShareInboxAttachment(
      fileName: "second.jpg",
      mimeType: "image/jpeg",
      relativePath: "\(adjacent.id)/second.jpg"
    )
    adjacent.attachments = [attachmentB]
    try store.enqueue(item, attachmentFiles: [(attachmentA, sourceA)])
    try store.enqueue(adjacent, attachmentFiles: [(attachmentB, sourceB)])
    let committedAt = Date(timeIntervalSince1970: 1_800_000_000)

    XCTAssertThrowsError(
      try store.complete(
        itemId: item.id,
        docId: item.documentId,
        committedAt: committedAt
      )
    )

    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
      .appendingPathComponent(
        "\(try XCTUnwrap(ShareInboxSafety.normalizedManifestID(item.id))).json"
      )
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let persisted = try decoder.decode(
      ShareInboxItem.self,
      from: Data(contentsOf: manifestURL)
    )
    XCTAssertEqual(
      persisted.result,
      ShareInboxResult(docId: item.documentId, committedAt: committedAt)
    )
    XCTAssertTrue(FileManager.default.fileExists(
      atPath: targetAttachmentDirectory.path
    ))

    let pending = store.pendingItems().compactMap { entry -> ShareInboxItem? in
      guard case let .ready(item) = entry else { return nil }
      return item
    }
    XCTAssertEqual(pending.map(\.id), [adjacent.id])
    XCTAssertFalse(FileManager.default.fileExists(atPath: manifestURL.path))
    XCTAssertFalse(FileManager.default.fileExists(
      atPath: targetAttachmentDirectory.path
    ))
    XCTAssertTrue(FileManager.default.fileExists(
      atPath: targetAttachmentDirectory
        .deletingLastPathComponent()
        .appendingPathComponent(adjacent.id).path
    ))
  }

  @MainActor
  func testViewModelKeepsOwnedFileUntilDelayedSaveThenCleansItUp() async throws {
    let (store, _) = try makeStore()
    let source = try makeProviderFile()
    let staged = try SharePayloadBuilder.stageImage(from: source, suggestedName: "shared-image.jpg")
    let expected = try Data(contentsOf: staged.ownedStagingURL)
    try FileManager.default.removeItem(at: source)
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      self.makeDraft(stagingURL: staged.ownedStagingURL)
    })

    await viewModel.load(from: nil)
    XCTAssertTrue(FileManager.default.fileExists(atPath: staged.ownedStagingURL.path))
    let didSave = await viewModel.save()
    XCTAssertTrue(didSave)

    XCTAssertFalse(FileManager.default.fileExists(atPath: staged.ownedStagingURL.path))
    let item = try XCTUnwrap(store.pendingItems().compactMap { entry -> ShareInboxItem? in
      guard case let .ready(item) = entry else { return nil }
      return item
    }.first)
    let attachment = try XCTUnwrap(item.attachments.first)
    XCTAssertEqual(try Data(contentsOf: try XCTUnwrap(store.attachmentURL(for: attachment))), expected)
  }

  @MainActor
  func testViewModelDiscardAndDraftReplacementCleanUpOwnedStaging() async throws {
    let (store, _) = try makeStore()
    let first = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "first.jpg"),
      suggestedName: "first.jpg"
    )
    let second = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "second.jpg"),
      suggestedName: "second.jpg"
    )
    var buildCount = 0
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      buildCount += 1
      return self.makeDraft(
        stagingURL: buildCount == 1 ? first.ownedStagingURL : second.ownedStagingURL,
        name: buildCount == 1 ? first.name : second.name
      )
    })

    await viewModel.load(from: nil)
    await viewModel.load(from: nil)

    XCTAssertFalse(FileManager.default.fileExists(atPath: first.ownedStagingURL.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: second.ownedStagingURL.path))
    viewModel.discard()
    viewModel.discard()
    XCTAssertFalse(FileManager.default.fileExists(atPath: second.ownedStagingURL.path))
  }

  @MainActor
  func testViewModelRetainsStagingFileWhenEnqueueFailsForRetry() async throws {
    let (_, containerURL) = try makeStore()
    let store = ShareInboxStore(
      fileManager: .default,
      containerURL: containerURL,
      copyFile: { _, _ in throw TestCopyError.interrupted }
    )
    let staged = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "retry.jpg"),
      suggestedName: "retry.jpg"
    )
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      self.makeDraft(stagingURL: staged.ownedStagingURL, name: staged.name)
    })

    await viewModel.load(from: nil)
    let didSave = await viewModel.save()

    XCTAssertFalse(didSave)
    XCTAssertTrue(FileManager.default.fileExists(atPath: staged.ownedStagingURL.path))
  }

  @MainActor
  func testViewModelDiscardsLateBuildAfterDiscard() async throws {
    let (store, _) = try makeStore()
    let staged = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "late.jpg"),
      suggestedName: "late.jpg"
    )
    let gate = DraftBuildGate()
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      await gate.next()
    })

    let load = Task { await viewModel.load(from: nil) }
    await gate.waitForPending(count: 1)
    viewModel.discard()
    await gate.resume(at: 0, with: makeDraft(stagingURL: staged.ownedStagingURL, name: staged.name))
    await load.value

    XCTAssertFalse(FileManager.default.fileExists(atPath: staged.ownedStagingURL.path))
    XCTAssertFalse(viewModel.canSave)
    XCTAssertEqual(viewModel.title, "")
  }

  @MainActor
  func testViewModelKeepsNewestConcurrentLoadWhenOlderBuildReturnsLast() async throws {
    let (store, _) = try makeStore()
    let old = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "old.jpg"),
      suggestedName: "old.jpg"
    )
    let latest = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "latest.jpg"),
      suggestedName: "latest.jpg"
    )
    let gate = DraftBuildGate()
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      await gate.next()
    })

    let firstLoad = Task { await viewModel.load(from: nil) }
    await gate.waitForPending(count: 1)
    let latestLoad = Task { await viewModel.load(from: nil) }
    await gate.waitForPending(count: 2)
    await gate.resume(
      at: 1,
      with: makeDraft(stagingURL: latest.ownedStagingURL, name: latest.name, title: "Latest image")
    )
    await latestLoad.value
    await gate.resume(
      at: 0,
      with: makeDraft(stagingURL: old.ownedStagingURL, name: old.name, title: "Old image")
    )
    await firstLoad.value

    XCTAssertEqual(viewModel.title, "Latest image")
    XCTAssertFalse(FileManager.default.fileExists(atPath: old.ownedStagingURL.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: latest.ownedStagingURL.path))
    viewModel.discard()
  }

  @MainActor
  func testViewModelDeinitDiscardsOwnedStagingFile() async throws {
    let (store, _) = try makeStore()
    let staged = try SharePayloadBuilder.stageImage(
      from: makeProviderFile(name: "deinit.jpg"),
      suggestedName: "deinit.jpg"
    )
    var viewModel: ShareViewModel? = ShareViewModel(store: store, buildPayload: { _ in
      self.makeDraft(stagingURL: staged.ownedStagingURL, name: staged.name)
    })

    await viewModel?.load(from: nil)
    viewModel = nil

    XCTAssertFalse(FileManager.default.fileExists(atPath: staged.ownedStagingURL.path))
  }

  @MainActor
  func testViewModelLoadsRichPreviewButKeepsOriginalTitleWhenSaving() async throws {
    let (store, _) = try makeStore()
    let requested = expectation(description: "rich preview requested")
    let preview = ShareLinkPreview(
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Remote rich title",
      siteName: "YouTube",
      description: "Remote description",
      provider: "youtube",
      author: .init(name: "Rick Astley"),
      durationSeconds: 214
    )
    let viewModel = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Original shared title",
          content: ShareInboxContent(
            kind: .url,
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            text: nil
          ),
          previewText: "Original preview",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in
        requested.fulfill()
        return preview
      },
      fetchRemoteImage: { _ in nil }
    )

    await viewModel.load(from: nil)
    await fulfillment(of: [requested], timeout: 1)
    await waitForMainActorCondition {
      viewModel.linkPreviewState == .loaded(preview)
    }

    XCTAssertEqual(viewModel.displayTitle, "Remote rich title")
    XCTAssertNil(viewModel.remoteMediaImage)
    let didSave = await viewModel.save()
    XCTAssertTrue(didSave)
    guard case let .ready(saved) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected saved rich share")
    }
    XCTAssertEqual(saved.title, "Original shared title")
    XCTAssertEqual(saved.preview, preview)
  }

  @MainActor
  func testViewModelPreviewFailureFallsBackAndStillSaves() async throws {
    let (store, _) = try makeStore()
    let viewModel = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Fallback title",
          content: ShareInboxContent(kind: .url, url: "https://example.com/article", text: nil),
          previewText: "Fallback preview",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in throw TestPreviewError.failed },
      fetchRemoteImage: { _ in nil }
    )

    await viewModel.load(from: nil)
    await waitForMainActorCondition { viewModel.linkPreviewState == .failed }

    XCTAssertTrue(viewModel.canSave)
    let didSave = await viewModel.save()
    XCTAssertTrue(didSave)
    guard case let .ready(saved) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected fallback share")
    }
    XCTAssertNil(saved.preview)
  }

  @MainActor
  func testViewModelSaveCancelsLoadingPreviewAndFreezesNilSnapshot() async throws {
    let (store, _) = try makeStore()
    let started = expectation(description: "preview started")
    let cancelled = expectation(description: "preview cancelled")
    let viewModel = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Save now",
          content: ShareInboxContent(kind: .url, url: "https://example.com/article", text: nil),
          previewText: "Fallback",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in
        started.fulfill()
        return try await withTaskCancellationHandler {
          try await Task.sleep(nanoseconds: 60_000_000_000)
          return ShareLinkPreview(url: "https://example.com/article", title: "Late")
        } onCancel: {
          cancelled.fulfill()
        }
      },
      fetchRemoteImage: { _ in nil }
    )

    await viewModel.load(from: nil)
    await fulfillment(of: [started], timeout: 1)
    XCTAssertEqual(viewModel.linkPreviewState, .loading)

    let didSave = await viewModel.save()
    XCTAssertTrue(didSave)
    await fulfillment(of: [cancelled], timeout: 1)
    guard case let .ready(saved) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected saved fallback snapshot")
    }
    XCTAssertNil(saved.preview)
  }

  @MainActor
  func testViewModelSaveFailureLeavesCancelledPreviewInFallbackState() async throws {
    let (_, containerURL) = try makeStore()
    let store = ShareInboxStore(
      fileManager: .default,
      containerURL: containerURL,
      writeData: { _, _, _ in throw TestWriteError.writeFailed }
    )
    let started = expectation(description: "preview started")
    let cancelled = expectation(description: "preview cancelled")
    let viewModel = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Retry",
          content: ShareInboxContent(kind: .url, url: "https://example.com/article", text: nil),
          previewText: "Fallback",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in
        started.fulfill()
        return try await withTaskCancellationHandler {
          try await Task.sleep(nanoseconds: 60_000_000_000)
          return ShareLinkPreview(url: "https://example.com/article")
        } onCancel: {
          cancelled.fulfill()
        }
      },
      fetchRemoteImage: { _ in nil }
    )

    await viewModel.load(from: nil)
    await fulfillment(of: [started], timeout: 1)
    XCTAssertEqual(viewModel.linkPreviewState, .loading)

    let didSave = await viewModel.save()

    XCTAssertFalse(didSave)
    await fulfillment(of: [cancelled], timeout: 1)
    XCTAssertEqual(viewModel.linkPreviewState, .failed)
    XCTAssertTrue(viewModel.canSave)
  }

  @MainActor
  func testViewModelIgnoresLatePreviewFromReplacedDraft() async throws {
    let (store, _) = try makeStore()
    let gate = PreviewFetchGate()
    var buildCount = 0
    let viewModel = ShareViewModel(
      store: store,
      buildPayload: { _ in
        buildCount += 1
        let suffix = buildCount == 1 ? "first" : "second"
        return SharePayloadDraft(
          title: suffix,
          content: ShareInboxContent(
            kind: .url,
            url: "https://example.com/\(suffix)",
            text: nil
          ),
          previewText: suffix,
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { url in try await gate.next(url: url) },
      fetchRemoteImage: { _ in nil }
    )

    await viewModel.load(from: nil)
    await gate.waitForPending(count: 1)
    await viewModel.load(from: nil)
    await gate.waitForPending(count: 2)
    let second = ShareLinkPreview(url: "https://example.com/second", title: "Second rich")
    await gate.resume(at: 1, with: .success(second))
    await waitForMainActorCondition { viewModel.linkPreviewState == .loaded(second) }
    let first = ShareLinkPreview(url: "https://example.com/first", title: "First rich")
    await gate.resume(at: 0, with: .success(first))
    await Task.yield()

    XCTAssertEqual(viewModel.linkPreviewState, .loaded(second))
    XCTAssertEqual(viewModel.displayTitle, "Second rich")
  }

  @MainActor
  func testViewModelDeinitCancelsRichPreviewRequest() async throws {
    let (store, _) = try makeStore()
    let started = expectation(description: "preview started")
    let cancelled = expectation(description: "preview cancelled")
    var viewModel: ShareViewModel? = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Shared",
          content: ShareInboxContent(kind: .url, url: "https://example.com/article", text: nil),
          previewText: "Shared",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in
        started.fulfill()
        return try await withTaskCancellationHandler {
          try await Task.sleep(nanoseconds: 60_000_000_000)
          return ShareLinkPreview(url: "https://example.com/article")
        } onCancel: {
          cancelled.fulfill()
        }
      },
      fetchRemoteImage: { _ in nil }
    )
    weak var weakViewModel = viewModel

    await viewModel?.load(from: nil)
    await fulfillment(of: [started], timeout: 1)
    viewModel = nil

    await fulfillment(of: [cancelled], timeout: 1)
    XCTAssertNil(weakViewModel)
  }

  @MainActor
  func testViewModelDeinitCancelsRemoteMediaRequestAfterPreviewLoads() async throws {
    let (store, _) = try makeStore()
    let mediaStarted = expectation(description: "media started")
    let mediaCancelled = expectation(description: "media cancelled")
    let preview = ShareLinkPreview(
      url: "https://example.com/article",
      title: "Rich",
      images: ["https://app.affine.pro/api/worker/image-proxy?url=thumbnail"]
    )
    var viewModel: ShareViewModel? = ShareViewModel(
      store: store,
      buildPayload: { _ in
        SharePayloadDraft(
          title: "Shared",
          content: ShareInboxContent(kind: .url, url: "https://example.com/article", text: nil),
          previewText: "Shared",
          file: nil,
          errorMessage: nil
        )
      },
      fetchLinkPreview: { _ in preview },
      fetchRemoteImage: { url in
        guard url != nil else { return nil }
        mediaStarted.fulfill()
        return await withTaskCancellationHandler {
          try? await Task.sleep(nanoseconds: 60_000_000_000)
          return nil
        } onCancel: {
          mediaCancelled.fulfill()
        }
      }
    )
    weak var weakViewModel = viewModel

    await viewModel?.load(from: nil)
    await fulfillment(of: [mediaStarted], timeout: 1)
    viewModel = nil

    await fulfillment(of: [mediaCancelled], timeout: 1)
    XCTAssertNil(weakViewModel)
  }

  func testNewManifestEncodesVersionThreeAndImportAttemptIDWithoutPreviewRoute() throws {
    let item = ShareInboxItem(
      title: "Shared",
      content: ShareInboxContent(kind: .url, url: "https://example.com", text: nil)
    )
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let manifest = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoder.encode(item)) as? [String: Any]
    )

    XCTAssertEqual(manifest["schemaVersion"] as? Int, 3)
    XCTAssertFalse((manifest["importAttemptId"] as? String ?? "").isEmpty)
    XCTAssertNil(manifest["previewRoute"])
  }

  func testStoreMigratesV1ManifestOnceAndAtomicallyPersistsV3BeforeReturningReady() throws {
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
    XCTAssertEqual(migrated.schemaVersion, 3)
    XCTAssertFalse(migrated.importAttemptId.isEmpty)
    XCTAssertEqual(migrated.previewRoute, .official)

    let rewritten = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any]
    )
    XCTAssertEqual(rewritten["schemaVersion"] as? Int, 3)
    XCTAssertEqual(rewritten["importAttemptId"] as? String, migrated.importAttemptId)
    XCTAssertNil(rewritten["previewRoute"])

    guard case let .ready(reloaded) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected the rewritten v3 manifest to remain ready")
    }
    XCTAssertEqual(reloaded.importAttemptId, migrated.importAttemptId)
  }

  func testStoreMigratesV2ToV3WithoutChangingAttemptOrDestinationState() throws {
    let (store, containerURL) = try makeStore()
    XCTAssertTrue(store.ensureDirectories())
    let id = UUID().uuidString
    let documentId = UUID().uuidString
    let importAttemptId = "attempt-preserved-byte-for-byte"
    let manifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(id).json")
    try v2Manifest(
      id: id,
      documentId: documentId,
      importAttemptId: importAttemptId
    ).write(to: manifestURL)

    guard case let .ready(migrated) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected the v2 manifest to migrate")
    }

    XCTAssertEqual(migrated.schemaVersion, 3)
    XCTAssertEqual(migrated.importAttemptId, importAttemptId)
    XCTAssertEqual(migrated.documentId, documentId)
    XCTAssertEqual(migrated.target?.workspaceId, "workspace-id")
    XCTAssertEqual(migrated.target?.tagIds, ["tag-a", "tag-b"])
    XCTAssertEqual(migrated.target?.collectionId, "collection-id")
    XCTAssertEqual(migrated.lastError, "retry-me")
    XCTAssertNil(migrated.preview)

    let rewritten = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any]
    )
    XCTAssertEqual(rewritten["schemaVersion"] as? Int, 3)
    XCTAssertEqual(rewritten["importAttemptId"] as? String, importAttemptId)
  }

  func testV2CommittedReceiptIdentitySurvivesV3Reencoding() throws {
    let id = UUID().uuidString
    let documentId = UUID().uuidString
    let importAttemptId = "committed-attempt-id"
    let committedAt = "2026-08-27T01:02:03Z"
    var manifest = try XCTUnwrap(
      JSONSerialization.jsonObject(
        with: v2Manifest(
          id: id,
          documentId: documentId,
          importAttemptId: importAttemptId
        )
      ) as? [String: Any]
    )
    manifest["result"] = [
      "docId": documentId,
      "committedAt": committedAt,
    ]
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601

    let decoded = try decoder.decode(
      ShareInboxItem.self,
      from: JSONSerialization.data(withJSONObject: manifest)
    )
    let reencoded = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoder.encode(decoded)) as? [String: Any]
    )
    let result = try XCTUnwrap(reencoded["result"] as? [String: Any])

    XCTAssertEqual(decoded.importAttemptId, importAttemptId)
    XCTAssertEqual(decoded.result?.docId, documentId)
    XCTAssertEqual(reencoded["schemaVersion"] as? Int, 3)
    XCTAssertEqual(reencoded["importAttemptId"] as? String, importAttemptId)
    XCTAssertEqual(result["docId"] as? String, documentId)
    XCTAssertEqual(result["committedAt"] as? String, committedAt)
  }

  func testVersionThreeManifestRoundTripsRichPreview() throws {
    let expectedPreview = ShareLinkPreview(
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up",
      siteName: "YouTube",
      description: "The official video",
      images: ["https://app.affine.pro/api/worker/image-proxy?url=thumbnail"],
      provider: "youtube",
      author: .init(name: "Rick Astley"),
      durationSeconds: 214,
      transcript: .init(
        language: "en",
        segments: [.init(text: "We're no strangers to love", startSeconds: 18.64)]
      )
    )
    let item = ShareInboxItem(
      title: "Shared",
      content: ShareInboxContent(
        kind: .url,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        text: nil
      ),
      preview: expectedPreview
    )
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601

    let decoded = try decoder.decode(ShareInboxItem.self, from: encoder.encode(item))

    XCTAssertEqual(decoded.schemaVersion, 3)
    XCTAssertEqual(decoded.preview, expectedPreview)
  }

  func testMalformedOrOversizedV3PreviewIsDiscardedWithoutDiscardingItem() throws {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let base: [String: Any] = [
      "schemaVersion": 3,
      "importAttemptId": "attempt-id",
      "id": UUID().uuidString,
      "documentId": UUID().uuidString,
      "createdAt": "2026-08-27T00:00:00Z",
      "title": "Shared",
      "content": ["kind": "url", "url": "https://example.com/article"],
      "attachments": [],
    ]
    var malformed = base
    malformed["preview"] = [
      "url": "https://example.com/article",
      "title": 42,
    ]
    var oversized = base
    oversized["preview"] = [
      "url": "https://example.com/article",
      "description": String(repeating: "x", count: 32_769),
    ]

    let malformedItem = try decoder.decode(
      ShareInboxItem.self,
      from: JSONSerialization.data(withJSONObject: malformed)
    )
    let oversizedItem = try decoder.decode(
      ShareInboxItem.self,
      from: JSONSerialization.data(withJSONObject: oversized)
    )

    XCTAssertEqual(malformedItem.title, "Shared")
    XCTAssertNil(malformedItem.preview)
    XCTAssertEqual(oversizedItem.title, "Shared")
    XCTAssertNil(oversizedItem.preview)
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

  func testStoreReturnsSupportedItemsBeforeFutureVersionEntries() throws {
    let (store, containerURL) = try makeStore()
    let ready = ShareInboxItem(
      createdAt: Date(timeIntervalSince1970: 1_800_000_000),
      title: "Ready",
      content: ShareInboxContent(kind: .text, url: nil, text: "ready")
    )
    try store.enqueue(ready)
    let futureId = UUID().uuidString
    let futureManifestURL = containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
      .appendingPathComponent("\(futureId).json")
    try Data("{\"schemaVersion\":99,\"id\":\"\(futureId)\"}".utf8)
      .write(to: futureManifestURL)

    let entries = store.pendingItems()

    guard case let .ready(first) = try XCTUnwrap(entries.first) else {
      return XCTFail("Expected supported share before future-version entry")
    }
    XCTAssertEqual(first.id, ready.id)
    XCTAssertEqual(
      entries.last,
      .unsupportedVersion(itemId: futureId, schemaVersion: 99)
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
    let supportedPDFPayload: [String: Any] = [
      "extensionItems": [[
        "attachments": [[
          "registeredTypeIdentifiers": ["com.adobe.pdf", "public.movie"]
        ]]
      ]]
    ]
    XCTAssertTrue(predicate.evaluate(with: youtubePayload))
    XCTAssertTrue(predicate.evaluate(with: supportedPDFPayload))
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

  func testResolvedAttachmentRequiresTheManifestIdentityAndValidatedFileMetadata() throws {
    let (store, containerURL) = try makeStore()
    let source = try makeProviderFile(data: makePNGData(), name: "shared.png")
    var item = ShareInboxItem(
      title: "Image",
      content: ShareInboxContent(kind: .image, url: nil, text: nil)
    )
    let attachment = ShareInboxAttachment(
      fileName: "shared.png",
      mimeType: "image/png",
      relativePath: "\(item.id)/shared.png"
    )
    item.attachments = [attachment]
    try store.enqueue(item, attachmentFiles: [(attachment, source)])
    let persisted = try XCTUnwrap(store.pendingItems().compactMap { entry -> ShareInboxItem? in
      guard case let .ready(value) = entry else { return nil }
      return value
    }.first)

    let resolved = try XCTUnwrap(store.resolveAttachment(for: persisted))
    XCTAssertEqual(resolved.itemId, persisted.id)
    XCTAssertEqual(resolved.name, "shared.png")
    XCTAssertEqual(resolved.mimeType, "image/png")
    XCTAssertEqual(resolved.size, makePNGData().count)
    XCTAssertTrue(resolved.url.path.hasPrefix(containerURL.path))

    var traversal = persisted
    traversal.attachments[0].relativePath = "../shared.png"
    XCTAssertNil(store.resolveAttachment(for: traversal))

    var mismatchedMime = persisted
    mismatchedMime.attachments[0].mimeType = "image/jpeg"
    XCTAssertNil(store.resolveAttachment(for: mismatchedMime))

    let outside = try makeProviderFile(data: makePNGData(), name: "outside.png")
    try FileManager.default.removeItem(at: resolved.url)
    try FileManager.default.createSymbolicLink(at: resolved.url, withDestinationURL: outside)
    XCTAssertNil(store.resolveAttachment(for: persisted))

    try FileManager.default.removeItem(at: resolved.url)
    try FileManager.default.createDirectory(at: resolved.url, withIntermediateDirectories: false)
    XCTAssertNil(store.resolveAttachment(for: persisted))

    try FileManager.default.removeItem(at: resolved.url)
    try makePNGData(size: 12 * 1024 * 1024 + 1).write(to: resolved.url)
    XCTAssertNil(store.resolveAttachment(for: persisted))

    try FileManager.default.removeItem(at: resolved.url)
    XCTAssertNil(store.resolveAttachment(for: persisted))
  }

}

private enum TestWriteError: Error {
  case writeFailed
}

private enum TestCopyError: Error {
  case interrupted
}

private enum TestThumbnailError: Error {
  case failed
}

private enum TestPreviewError: Error {
  case failed
}

@MainActor
private func waitForMainActorCondition(
  attempts: Int = 200,
  _ condition: () -> Bool
) async {
  for _ in 0..<attempts {
    if condition() { return }
    try? await Task.sleep(nanoseconds: 5_000_000)
  }
}

private actor PreviewFetchGate {
  private var continuations: [CheckedContinuation<ShareLinkPreview, Error>] = []
  private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []

  func next(url: String) async throws -> ShareLinkPreview {
    try await withCheckedThrowingContinuation { continuation in
      continuations.append(continuation)
      resumeWaiters()
    }
  }

  func waitForPending(count: Int) async {
    guard continuations.count < count else { return }
    await withCheckedContinuation { continuation in
      waiters.append((count, continuation))
    }
  }

  func resume(at index: Int, with result: Result<ShareLinkPreview, Error>) {
    continuations.remove(at: index).resume(with: result)
  }

  private func resumeWaiters() {
    let ready = waiters.enumerated().filter { continuations.count >= $0.element.0 }
    for (index, _) in ready.reversed() {
      waiters.remove(at: index).1.resume()
    }
  }
}

private actor DraftBuildGate {
  private var continuations: [CheckedContinuation<SharePayloadDraft, Never>] = []
  private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []

  func next() async -> SharePayloadDraft {
    await withCheckedContinuation { continuation in
      continuations.append(continuation)
      resumeWaiters()
    }
  }

  func waitForPending(count: Int) async {
    guard continuations.count < count else { return }
    await withCheckedContinuation { continuation in
      waiters.append((count, continuation))
    }
  }

  func resume(at index: Int, with draft: SharePayloadDraft) {
    continuations.remove(at: index).resume(returning: draft)
  }

  private func resumeWaiters() {
    let ready = waiters.enumerated().filter { continuations.count >= $0.element.0 }
    for (index, _) in ready.reversed() {
      waiters.remove(at: index).1.resume()
    }
  }
}
