import Foundation
import XCTest
@testable import AffinePaywall

final class AppStorePurchaseJournalTests: XCTestCase {
  @MainActor
  func testRestartPreservesOriginalReportsAndSeparatesServersAndUsers() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appendingPathComponent("results.json")
    let journal = AppStorePurchaseJournal(fileURL: fileURL)
    let context = AppStorePurchaseContext(
      serverBaseURL: "https://first.example/api", userID: "user"
    )
    let otherUser = AppStorePurchaseContext(
      serverBaseURL: context.serverBaseURL, userID: "other"
    )
    let otherServer = AppStorePurchaseContext(
      serverBaseURL: "https://second.example/api", userID: context.userID
    )
    let canceled = AppStorePurchaseReport(
      context: context, productID: "pro.monthly", attemptID: "cancel", outcome: .canceled
    )
    let submitted = AppStorePurchaseReport(
      context: context, productID: "ai.yearly", attemptID: "submit",
      outcome: .submitted(transactionID: "transaction")
    )
    let userReport = AppStorePurchaseReport(
      context: otherUser, productID: canceled.productID,
      attemptID: canceled.attemptID, outcome: canceled.outcome
    )
    let serverReport = AppStorePurchaseReport(
      context: otherServer, productID: canceled.productID,
      attemptID: canceled.attemptID, outcome: canceled.outcome
    )
    for report in [canceled, submitted, userReport, serverReport] {
      try journal.save(report)
    }
    let restarted = AppStorePurchaseJournal(fileURL: fileURL)
    XCTAssertEqual(try restarted.pending(in: context), [canceled, submitted])
    XCTAssertEqual(try restarted.pending(in: otherUser), [userReport])
    XCTAssertEqual(try restarted.pending(in: otherServer), [serverReport])

    var sent: [AppStorePurchaseReport] = []
    await restarted.replay(in: context) { report in
      sent.append(report)
      if report.outcome == .canceled {
        throw URLError(.notConnectedToInternet)
      }
      return AppStorePurchaseResponse(status: "processing", attemptID: report.attemptID, provider: nil)
    }
    XCTAssertEqual(sent, [canceled, submitted])
    let afterDelivery = AppStorePurchaseJournal(fileURL: fileURL)
    XCTAssertEqual(try afterDelivery.pending(in: context), [canceled])
    XCTAssertEqual(try afterDelivery.pending(in: otherUser), [userReport])
    XCTAssertEqual(try afterDelivery.pending(in: otherServer), [serverReport])
  }

  @MainActor
  func testOnlyDeliveryAcknowledgmentClearsAnObservedResult() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appendingPathComponent("results.json")
    let context = AppStorePurchaseContext(serverBaseURL: "https://first.example", userID: "user")
    let canceled = AppStorePurchaseReport(
      context: context, productID: "pro.monthly", attemptID: "attempt", outcome: .canceled
    )
    let submitted = AppStorePurchaseReport(
      context: context, productID: canceled.productID, attemptID: canceled.attemptID,
      outcome: .submitted(transactionID: "transaction")
    )
    let cases: [(AppStorePurchaseReport, AppStorePurchaseResponse, Bool)] = [
      (canceled, .init(status: "processing", attemptID: canceled.attemptID, provider: nil), false),
      (canceled, .init(status: "canceled", attemptID: nil, provider: nil), true),
      (submitted, .init(status: "confirmed", attemptID: nil, provider: nil), false),
      (submitted, .init(status: "conflict", attemptID: "other-attempt", provider: nil), false),
      (submitted, .init(status: "processing", attemptID: submitted.attemptID, provider: nil), true),
    ]
    for (report, response, acknowledged) in cases {
      let journal = AppStorePurchaseJournal(fileURL: fileURL)
      try journal.save(report)
      _ = try await journal.deliver(report) { observed in
        XCTAssertEqual(observed, report)
        return response
      }
      XCTAssertEqual(
        try AppStorePurchaseJournal(fileURL: fileURL).pending(in: context),
        acknowledged ? [] : [report]
      )
    }

    let journal = AppStorePurchaseJournal(fileURL: fileURL)
    try journal.save(submitted)
    do {
      _ = try await journal.deliver(submitted) { _ in
        throw URLError(.networkConnectionLost)
      }
      XCTFail("Delivery must report the network failure")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost)
    }
    XCTAssertEqual(try AppStorePurchaseJournal(fileURL: fileURL).pending(in: context), [submitted])
  }

  @MainActor
  func testLocalIOFailuresPreserveServerDeliveryAndProviderErrors() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer {
      try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
      try? FileManager.default.removeItem(at: directory)
    }
    let fileURL = directory.appendingPathComponent("results.json")
    let context = AppStorePurchaseContext(serverBaseURL: "https://first.example", userID: "user")
    let report = AppStorePurchaseReport(
      context: context, productID: "pro.monthly", attemptID: "attempt",
      outcome: .submitted(transactionID: "transaction")
    )
    let invalidData = Data("invalid journal".utf8)
    try invalidData.write(to: fileURL)
    let journal = AppStorePurchaseJournal(fileURL: fileURL)
    var delivered: [AppStorePurchaseReport] = []
    let response = try await journal.recordAndDeliver(report) { observed in
      delivered.append(observed)
      return AppStorePurchaseResponse(status: "processing", attemptID: report.attemptID, provider: nil)
    }
    XCTAssertEqual(delivered, [report])
    XCTAssertEqual(response.attemptID, report.attemptID)
    XCTAssertEqual(try Data(contentsOf: fileURL), invalidData)

    do {
      _ = try await journal.recordAndDeliver(report) { _ in
        throw URLError(.networkConnectionLost)
      }
      XCTFail("Provider failure must reach the caller even when persistence fails")
    } catch {
      XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost)
    }

    try FileManager.default.removeItem(at: fileURL)
    try journal.save(report)
    let persisted = try Data(contentsOf: fileURL)
    let acknowledged = try await journal.deliver(report) { _ in
      try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
      return AppStorePurchaseResponse(status: "confirmed", attemptID: report.attemptID, provider: nil)
    }
    XCTAssertEqual(acknowledged.status, "confirmed")
    XCTAssertEqual(try Data(contentsOf: fileURL), persisted)
    XCTAssertEqual(try journal.pending(in: context), [report])
  }
}
