import Foundation

struct AppStorePurchaseContext: Codable, Equatable {
  let serverBaseURL: String
  let userID: String
}

struct AppStorePurchaseResponse {
  let status: String
  let attemptID: String?
  let provider: String?
}

struct AppStorePurchaseReport: Codable, Equatable {
  enum Outcome: Codable, Equatable {
    case canceled
    case submitted(transactionID: String)
  }

  let context: AppStorePurchaseContext
  let productID: String
  let attemptID: String
  let outcome: Outcome

  var action: String {
    switch outcome {
    case .canceled: "Cancel"
    case .submitted: "Submit"
    }
  }

  var transactionID: String? {
    switch outcome {
    case .canceled: nil
    case let .submitted(transactionID): transactionID
    }
  }

  func acknowledged(by response: AppStorePurchaseResponse) -> Bool {
    switch outcome {
    case .canceled: response.status == "canceled"
    case .submitted: response.attemptID == attemptID
    }
  }
}

@MainActor
final class AppStorePurchaseJournal {
  private let fileURL: URL

  init(
    fileURL: URL = FileManager.default
      .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("AffinePaywall/purchase-results-v1.json")
  ) {
    self.fileURL = fileURL
  }

  func pending(in context: AppStorePurchaseContext) throws -> [AppStorePurchaseReport] {
    try read().filter { $0.context == context }
  }

  func save(_ report: AppStorePurchaseReport) throws {
    var reports = try read()
    reports.removeAll { $0.context == report.context && $0.attemptID == report.attemptID }
    reports.append(report)
    try write(reports)
  }

  private func acknowledge(_ report: AppStorePurchaseReport, response: AppStorePurchaseResponse) throws {
    guard report.acknowledged(by: response) else { return }
    var reports = try read()
    reports.removeAll { $0 == report }
    try write(reports)
  }

  func deliver(
    _ report: AppStorePurchaseReport,
    send: (AppStorePurchaseReport) async throws -> AppStorePurchaseResponse
  ) async throws -> AppStorePurchaseResponse {
    let response = try await send(report)
    do {
      try acknowledge(report, response: response)
    } catch {
      NSLog("Unable to remove acknowledged App Store purchase result: %@", error.localizedDescription)
    }
    return response
  }

  func recordAndDeliver(
    _ report: AppStorePurchaseReport,
    send: (AppStorePurchaseReport) async throws -> AppStorePurchaseResponse
  ) async throws -> AppStorePurchaseResponse {
    do {
      try save(report)
    } catch {
      NSLog("Unable to save App Store purchase result: %@", error.localizedDescription)
    }
    return try await deliver(report, send: send)
  }

  func replay(
    in context: AppStorePurchaseContext,
    send: (AppStorePurchaseReport) async throws -> AppStorePurchaseResponse
  ) async {
    do {
      for report in try pending(in: context) {
        do {
          _ = try await deliver(report, send: send)
        } catch {
          NSLog("Unable to replay App Store purchase result: %@", error.localizedDescription)
        }
      }
    } catch {
      NSLog("Unable to read App Store purchase results: %@", error.localizedDescription)
    }
  }

  private func read() throws -> [AppStorePurchaseReport] {
    guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
    return try JSONDecoder().decode([AppStorePurchaseReport].self, from: Data(contentsOf: fileURL))
  }

  private func write(_ reports: [AppStorePurchaseReport]) throws {
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    try JSONEncoder().encode(reports).write(to: fileURL, options: .atomic)
  }
}
