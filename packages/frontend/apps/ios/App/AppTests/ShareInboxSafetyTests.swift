import XCTest
import UIKit

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

  private func makeImageData(size: Int = 256 * 1024) -> Data {
    var data = Data([0xFF, 0xD8, 0xFF, 0xE0])
    data.append(Data(repeating: 0x42, count: size - data.count))
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

  private func makeDraft(stagingURL: URL, name: String = "shared-image.jpg") -> SharePayloadDraft {
    SharePayloadDraft(
      title: "Shared image",
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

}

private enum TestWriteError: Error {
  case writeFailed
}

private enum TestCopyError: Error {
  case interrupted
}
