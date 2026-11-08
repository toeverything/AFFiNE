import Foundation

func parseAuthISO8601Date(_ value: String) -> Date? {
  let fractional = ISO8601DateFormatter()
  fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}
