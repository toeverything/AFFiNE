import UIKit
import UniformTypeIdentifiers
import XCTest

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

  private func makeImageData(size: Int? = nil) -> Data {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { context in
      UIColor.red.setFill()
      context.cgContext.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
    var data = image.jpegData(compressionQuality: 1)!
    if let size {
      data.append(Data(repeating: 0, count: max(0, size - data.count)))
    }
    return data
  }

  private func makePNGData(size: Int? = nil) -> Data {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { context in
      UIColor.red.setFill()
      context.cgContext.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
    var data = image.pngData()!
    if let size {
      data.append(Data(repeating: 0, count: max(0, size - data.count)))
    }
    return data
  }

  private func makePDFData(size: Int = 64 * 1024) -> Data {
    let renderer = UIGraphicsPDFRenderer(
      bounds: CGRect(x: 0, y: 0, width: 320, height: 480)
    )
    var data = renderer.pdfData { context in
      context.beginPage()
      "AFFiNE PDF share preview".draw(at: CGPoint(x: 24, y: 24), withAttributes: nil)
    }
    data.append(Data(repeating: 0x20, count: max(0, size - data.count)))
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
    XCTAssertFalse(file.thumbnailData.isEmpty)
    XCTAssertLessThanOrEqual(file.thumbnailData.count, ShareInboxConstants.maxThumbnailBytes)
  }

  func testBuilderRejectsInvalidPDFRepresentations() throws {
    let cases: [(String, Data, String)] = [
      ("spoofed declared type", makePDFData(), UTType.jpeg.identifier),
      ("missing PDF magic", Data("not a PDF".utf8), UTType.pdf.identifier),
      ("empty file", Data(), UTType.pdf.identifier),
    ]
    for (name, data, declaredType) in cases {
      let source = try makeProviderFile(data: data, name: "report.pdf")
      XCTAssertThrowsError(try SharePayloadBuilder.stagePDF(
        from: source, suggestedName: source.lastPathComponent, declaredTypeIdentifier: declaredType
      ), name)
    }
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

  func testBuilderRejectsOversizedImageFromSpecificFileRepresentationBeforeGenericDataLoad() async throws {
    let source = try makeProviderFile(data: makePNGData(), name: "oversized.png")
    let handle = try FileHandle(forWritingTo: source)
    try handle.truncate(atOffset: UInt64(12 * 1024 * 1024 + 1))
    try handle.close()
    let provider = NSItemProvider()
    let genericData = makePNGData()
    var didLoadSpecificFile = false
    var didLoadGenericData = false
    provider.registerFileRepresentation(
      forTypeIdentifier: UTType.png.identifier,
      fileOptions: [],
      visibility: .all
    ) { completion in
      didLoadSpecificFile = true
      completion(source, true, nil)
      return nil
    }
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.image.identifier,
      visibility: .all
    ) { completion in
      didLoadGenericData = true
      completion(genericData, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertNil(draft.content)
    XCTAssertEqual(draft.errorMessage, "The image must be smaller than 12 MB.")
    XCTAssertTrue(didLoadSpecificFile)
    XCTAssertFalse(didLoadGenericData)
  }

  func testBuilderStagesImageFromADataOnlyProviderThroughFileRepresentation() async throws {
    let imageData = makePNGData()
    let provider = NSItemProvider()
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.png.identifier,
      visibility: .all
    ) { completion in
      completion(imageData, nil)
      return nil
    }
    let extensionItem = NSExtensionItem()
    extensionItem.attachments = [provider]

    let draft = await SharePayloadBuilder.build(from: [extensionItem])

    XCTAssertEqual(draft.content?.kind, .image)
    let file = try XCTUnwrap(draft.file)
    XCTAssertEqual(file.mimeType, "image/png")
    XCTAssertEqual(try Data(contentsOf: file.ownedStagingURL), imageData)
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

  func testBuilderDoesNotLoadBinaryRepresentationsForARemotePDFURL() async throws {
    let pdf = try makeProviderFile(data: makePDFData(), name: "report.pdf")
    let png = makePNGData()
    let provider = try NSItemProvider(object: XCTUnwrap(URL(string: "https://example.com/report.pdf")) as NSURL)
    var didLoadImage = false
    var didLoadPDF = false
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.png.identifier,
      visibility: .all
    ) { completion in
      didLoadImage = true
      completion(png, nil)
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
    let first = try NSItemProvider(object: XCTUnwrap(URL(string: "https://example.com/first")) as NSURL)
    let second = try NSItemProvider(object: XCTUnwrap(URL(string: "https://example.com/report.pdf")) as NSURL)
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
    let remoteURL = try NSItemProvider(
      object: XCTUnwrap(URL(string: "https://example.com/report.pdf")) as NSURL
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

  func testBuilderRejectsTwoLocalPDFsEvenWhenShareContainsAURL() async throws {
    let remoteURL = try NSItemProvider(object: XCTUnwrap(URL(string: "https://example.com")) as NSURL)
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
        ),
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
    XCTAssertEqual(try Data(contentsOf: XCTUnwrap(store.attachmentURL(for: attachment))), Data([0xFF, 0xD8, 0xFF]))
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

    let manifestURL = try containerURL
      .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
      .appendingPathComponent(
        "\(XCTUnwrap(ShareInboxSafety.normalizedManifestID(item.id))).json"
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
  func testViewModelSavesOriginalURLAndEditedTitle() async throws {
    let (store, _) = try makeStore()
    let url = "https://example.com/article?source=share"
    let viewModel = ShareViewModel(store: store, buildPayload: { _ in
      SharePayloadDraft(title: "Original", content: ShareInboxContent(kind: .url, url: url, text: "Selected text"), previewText: url, file: nil, errorMessage: nil)
    })
    await viewModel.load(from: nil)
    viewModel.updateTitle("My title")
    let saved = await viewModel.save()
    XCTAssertTrue(saved)
    let item = try XCTUnwrap(store.pendingItems().compactMap { entry -> ShareInboxItem? in
      guard case let .ready(item) = entry else { return nil }
      return item
    }.first)
    XCTAssertEqual(item.title, "My title")
    XCTAssertEqual(item.content.url, url)
    XCTAssertEqual(item.content.text, "Selected text")
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
    XCTAssertEqual(try Data(contentsOf: XCTUnwrap(store.attachmentURL(for: attachment))), expected)
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

  func testNewManifestEncodesFinalVersionAndImportAttemptID() throws {
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
    XCTAssertEqual(migrated.content.url, "https://example.com/original?token=value")

    let rewritten = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any]
    )
    XCTAssertEqual(rewritten["schemaVersion"] as? Int, 2)
    XCTAssertEqual(rewritten["importAttemptId"] as? String, migrated.importAttemptId)
    XCTAssertEqual(rewritten["previewRoute"] as? String, "official")

    guard case let .ready(reloaded) = try XCTUnwrap(store.pendingItems().first) else {
      return XCTFail("Expected the rewritten v2 manifest to remain ready")
    }
    XCTAssertEqual(reloaded.importAttemptId, migrated.importAttemptId)
    XCTAssertEqual(reloaded.content.url, migrated.content.url)
  }

  func testCommittedReceiptIdentitySurvivesV2Reencoding() throws {
    let id = UUID().uuidString
    let documentId = UUID().uuidString
    let importAttemptId = "committed-attempt-id"
    let committedAt = "2026-08-27T01:02:03Z"
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let item = ShareInboxItem(
      id: id,
      documentId: documentId,
      importAttemptId: importAttemptId,
      title: "Original",
      content: ShareInboxContent(kind: .url, url: "https://example.com/original", text: nil)
    )
    var manifest = try XCTUnwrap(
      JSONSerialization.jsonObject(with: encoder.encode(item)) as? [String: Any]
    )
    manifest["result"] = [
      "docId": documentId,
      "committedAt": committedAt,
    ]
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601

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
    XCTAssertEqual(reencoded["schemaVersion"] as? Int, 2)
    XCTAssertEqual(reencoded["importAttemptId"] as? String, importAttemptId)
    XCTAssertEqual(result["docId"] as? String, documentId)
    XCTAssertEqual(result["committedAt"] as? String, committedAt)
  }

  func testStorePreservesFutureManifestsDuringEnumerationAndUpdate() throws {
    for id in [UUID().uuidString, "future-item"] {
      let (store, containerURL) = try makeStore()
      XCTAssertTrue(store.ensureDirectories())
      let manifestURL = containerURL
        .appendingPathComponent(ShareInboxConstants.inboxDirectoryName, isDirectory: true)
        .appendingPathComponent("\(id).json")
      let futureManifest = Data("{\"schemaVersion\":99,\"id\":\"\(id)\"}".utf8)
      try futureManifest.write(to: manifestURL)

      let entries = store.pendingItems()
      XCTAssertEqual(entries, [.unsupportedVersion(itemId: id, schemaVersion: 99)])
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
      XCTAssertFalse(
        FileManager.default.fileExists(
          atPath: containerURL
            .appendingPathComponent(ShareInboxConstants.inboxDirectoryName)
            .appendingPathComponent(ShareInboxConstants.invalidDirectoryName)
            .appendingPathComponent("\(id).json").path
        )
      )
    }
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

  func testManifestTitleOnlyAcceptsExplicitEdits() {
    for (edited, expected) in [(nil, "Original Safari title"), ("  My explicit title  ", "My explicit title")] as [(String?, String)] {
      XCTAssertEqual(ShareInboxSafety.manifestTitle(original: "Original Safari title", userEdited: edited), expected)
    }
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
        ],
      ]],
    ]
    let supportedPDFPayload: [String: Any] = [
      "extensionItems": [[
        "attachments": [[
          "registeredTypeIdentifiers": ["com.adobe.pdf", "public.movie"],
        ]],
      ]],
    ]
    let unsupportedPayload: [String: Any] = [
      "extensionItems": [[
        "attachments": [[
          "registeredTypeIdentifiers": ["public.movie", "public.audio"],
        ]],
      ]],
    ]
    XCTAssertTrue(predicate.evaluate(with: youtubePayload))
    XCTAssertTrue(predicate.evaluate(with: supportedPDFPayload))
    XCTAssertFalse(predicate.evaluate(with: unsupportedPayload))
  }

  func testManifestIDsMustBeUUIDs() {
    let id = UUID().uuidString
    XCTAssertEqual(ShareInboxSafety.normalizedManifestID(id.lowercased()), id)
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("../item"))
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("nested/item"))
  }

  func testPreviewRouteUsesWorkspaceModeAndPublicProviderAllowlist() throws {
    let (store, _) = try makeStore()
    XCTAssertEqual(store.workspaceMode(), .unknown)
    for mode in [ShareWorkspaceMode.unknown, .signedOut, .cloudOnly, .selfHostedPresent] {
      try store.updateWorkspaceMode(mode)
      XCTAssertEqual(store.workspaceMode(), mode)
      XCTAssertEqual(ShareInboxSafety.previewRoute(url: "https://example.com/private", mode: mode),
                     mode == .cloudOnly || mode == .signedOut ? .official : .deferred)
      for url in ["https://youtu.be/video", "https://youtube.com/watch?v=video", "https://x.com/person/status/123"] {
        XCTAssertEqual(ShareInboxSafety.previewRoute(url: url, mode: mode), .official)
      }
      XCTAssertEqual(ShareInboxSafety.previewRoute(url: "file:///private/file", mode: mode), .deferred)
    }
    for url in ["https://x.com/person", "https://x.com/person/status/not-a-number", "https://youtube.com.example/watch?v=video"] {
      XCTAssertEqual(ShareInboxSafety.previewRoute(url: url, mode: .selfHostedPresent), .deferred)
    }
  }

  func testPreviewTransportRejectsOversizedResponsesAndUnapprovedImageURLs() async throws {
    let limit = 1024 * 1024
    for (size, advertised) in [(16383, false), (16384, false), (16385, false), (limit, false), (limit + 1, false), (limit + 1, true)] {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [PreviewResponseURLProtocol.self]
      configuration.httpAdditionalHeaders = [
        "X-Fixture-Bytes": String(size), "X-Fixture-Advertise-Length": String(advertised),
      ]
      let session = URLSession(configuration: configuration)
      defer { session.invalidateAndCancel() }
      let client = ShareLinkPreviewClient(session: session, appVersion: "test")
      do {
        let preview = try await client.fetch(url: "https://example.com/article")
        XCTAssertLessThanOrEqual(size, limit)
        XCTAssertEqual(preview.title, "Boundary")
      } catch let error as URLError {
        XCTAssertGreaterThan(size, limit)
        XCTAssertEqual(error.code, .dataLengthExceedsMaximum)
      }
    }
    let client = ShareLinkPreviewClient(appVersion: "test")
    do {
      _ = try await client.fetchImage(url: "https://example.com/image.png")
      XCTFail("Expected an unapproved image URL to be rejected")
    } catch let error as URLError {
      XCTAssertEqual(error.code, .badURL)
    }
  }

  func testPreviewClipsLargeTranscriptsWithoutDroppingBaseMetadata() throws {
    for segments in [Array(repeating: ["text": "Caption"], count: 501), [["text": String(repeating: "中", count: 200_000)]]] {
      let data = try JSONSerialization.data(withJSONObject: [
        "url": "https://example.com/article", "title": String(repeating: "A", count: 1000),
        "description": "Summary", "author": ["name": NSNull()], "durationSeconds": -1,
        "transcript": ["segments": segments],
      ])
      let preview = try JSONDecoder().decode(ShareLinkPreview.self, from: data)
      XCTAssertEqual(preview.title, String(repeating: "A", count: 120))
      XCTAssertEqual(preview.description, "Summary")
      XCTAssertNil(preview.author)
      XCTAssertNil(preview.durationSeconds)
      XCTAssertEqual(preview.transcript?.segments.count, 1)
      XCTAssertEqual(preview.transcript?.previewText?.count, 241)
    }
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

private final class PreviewResponseURLProtocol: URLProtocol {
  override class func canInit(with _: URLRequest) -> Bool {
    true
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let size = Int(request.value(forHTTPHeaderField: "X-Fixture-Bytes")!)!
    let headers = request.value(forHTTPHeaderField: "X-Fixture-Advertise-Length") == "true"
      ? ["Content-Length": String(size)] : [:]
    let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil,
                                   headerFields: headers)!
    var data = Data(#"{"url":"https://example.com/article","title":"Boundary"}"#.utf8)
    data.append(Data(repeating: 0x20, count: size - data.count))
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: data)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}
}
