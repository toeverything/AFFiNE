import Foundation
import XCTest

final class ShareInboxSafetyTests: XCTestCase {
  func testYouTubeHostsRequireDomainBoundaries() {
    XCTAssertTrue(ShareInboxSafety.isYouTubeHost("youtube.com"))
    XCTAssertTrue(ShareInboxSafety.isYouTubeHost("m.youtube.com"))
    XCTAssertTrue(ShareInboxSafety.isYouTubeHost("youtube-nocookie.com"))
    XCTAssertTrue(ShareInboxSafety.isYouTubeHost("youtu.be"))

    XCTAssertFalse(ShareInboxSafety.isYouTubeHost("notyoutube.com"))
    XCTAssertFalse(ShareInboxSafety.isYouTubeHost("youtube.com.attacker.example"))
    XCTAssertFalse(ShareInboxSafety.isYouTubeHost("youtube-nocookie.com.attacker.example"))
  }

  func testRemoteXMediaRequiresTrustedHTTPSHost() {
    XCTAssertTrue(
      ShareInboxSafety.isAllowedXMediaURL(URL(string: "https://pbs.twimg.com/media/example.jpg")!)
    )
    XCTAssertFalse(
      ShareInboxSafety.isAllowedXMediaURL(URL(string: "http://pbs.twimg.com/media/example.jpg")!)
    )
    XCTAssertFalse(
      ShareInboxSafety.isAllowedXMediaURL(
        URL(string: "https://pbs.twimg.com.attacker.example/image.jpg")!)
    )
    XCTAssertFalse(
      ShareInboxSafety.isAllowedXMediaURL(URL(string: "https://127.0.0.1/private.jpg")!)
    )
    XCTAssertFalse(
      ShareInboxSafety.isAllowedXMediaURL(URL(string: "https://user@pbs.twimg.com/image.jpg")!)
    )
    XCTAssertFalse(
      ShareInboxSafety.isAllowedXMediaURL(URL(string: "https://pbs.twimg.com:8443/image.jpg")!)
    )
  }

  func testXMLEntitiesAreDecodedExactlyOnce() {
    XCTAssertEqual(
      ShareInboxSafety.decodeXMLEntitiesOnce("&amp;lt;script&amp;gt;"),
      "&lt;script&gt;"
    )
    XCTAssertEqual(ShareInboxSafety.decodeXMLEntitiesOnce("&#128640;"), "🚀")
  }

  func testCaptionMarkupDropsUnfinishedTags() {
    XCTAssertEqual(ShareInboxSafety.stripCaptionMarkup("hello <script"), "hello ")
    XCTAssertEqual(ShareInboxSafety.stripCaptionMarkup("<b>Hello</b> world"), "Hello world")
  }

  func testPlainTextCannotCreateRemoteMarkdownImages() {
    XCTAssertEqual(
      ShareInboxSafety.escapeMarkdownText("![track](http://127.0.0.1/private)"),
      #"\!\[track\]\(http://127\.0\.0\.1/private\)"#
    )
    XCTAssertEqual(
      ShareInboxSafety.escapeMarkdownText(
        ShareInboxSafety.decodeXMLEntitiesOnce("&lt;img src=x&gt;")
      ),
      #"\<img src=x\>"#
    )
  }

  func testSourceURLsCannotBreakOutOfMarkdownDestination() {
    let unsafe = "https://example.com/)![track](http://127.0.0.1/private)"
    let safe = ShareInboxSafety.safeMarkdownWebURL(unsafe)

    XCTAssertTrue(safe == nil || safe?.contains(")") == false)
    XCTAssertTrue(safe == nil || safe?.contains("(") == false)
    XCTAssertEqual(
      ShareInboxSafety.safeMarkdownWebURL("https://example.com/source"),
      "https://example.com/source"
    )
  }

  func testRasterImagesAreDetectedFromBytes() {
    XCTAssertEqual(
      ShareInboxSafety.detectRasterImageMimeType(Data([0xFF, 0xD8, 0xFF, 0x00])),
      "image/jpeg"
    )
    XCTAssertNil(
      ShareInboxSafety.detectRasterImageMimeType(Data("<svg></svg>".utf8))
    )
  }

  func testManifestIDsMustBeCanonicalUUIDs() {
    let id = "4BDB8B19-2E54-442F-A2AA-BB1D8A254D3D"
    XCTAssertEqual(ShareInboxSafety.normalizedManifestID(id), id)
    XCTAssertEqual(ShareInboxSafety.normalizedManifestID(id.lowercased()), id)
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("../sentinel"))
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("nested/item"))
    XCTAssertNil(ShareInboxSafety.normalizedManifestID("/absolute"))
  }

  func testShortPlainTextRemainsImportable() {
    XCTAssertEqual(
      ShareInboxSafety.importablePlainText("Short note", excludingURL: nil),
      "Short note"
    )
    XCTAssertNil(
      ShareInboxSafety.importablePlainText(
        "https://example.com",
        excludingURL: "https://example.com"
      )
    )
  }

  func testUnsupportedFileWithoutTextIsNotImportable() {
    XCTAssertFalse(
      ShareInboxSafety.hasImportableContent(markdown: "")
    )
    XCTAssertTrue(
      ShareInboxSafety.hasImportableContent(markdown: "Short note")
    )
  }

  func testAttributedTextIsBodyOnlyWithoutAttachments() {
    XCTAssertEqual(
      ShareInboxSafety.attributedTextBody(
        "Attributed note",
        hasAttachments: false,
        existingText: nil
      ),
      "Attributed note"
    )
    XCTAssertNil(
      ShareInboxSafety.attributedTextBody(
        "document.pdf",
        hasAttachments: true,
        existingText: nil
      )
    )
  }
}
