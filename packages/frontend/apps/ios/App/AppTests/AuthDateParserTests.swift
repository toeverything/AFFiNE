import XCTest

final class AuthDateParserTests: XCTestCase {
  func testAcceptsServerTimestamps() {
    XCTAssertNotNil(parseAuthISO8601Date("2026-07-12T03:14:37.000Z"))
    XCTAssertNotNil(parseAuthISO8601Date("2026-07-12T03:14:37Z"))
    XCTAssertNil(parseAuthISO8601Date("not-a-date"))
  }
}
