//
//  ShareInboxSafety.swift
//  Shared between AFFiNE and ShareExtension
//

import Foundation

enum ShareInboxSafety {
  private static let xmlEntityRegex = try! NSRegularExpression(
    pattern: #"&(?:amp|lt|gt|quot|apos|#39|#\d+);"#
  )

  static func isYouTubeHost(_ value: String) -> Bool {
    let host =
      value
      .lowercased()
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
    return host == "youtu.be"
      || host == "youtube.com"
      || host.hasSuffix(".youtube.com")
      || host == "youtube-nocookie.com"
      || host.hasSuffix(".youtube-nocookie.com")
  }

  static func normalizedManifestID(_ value: String) -> String? {
    UUID(uuidString: value)?.uuidString
  }

  static func safeMarkdownWebURL(_ value: String) -> String? {
    guard
      let components = URLComponents(
        string: value.trimmingCharacters(in: .whitespacesAndNewlines)
      ),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      components.host?.isEmpty == false,
      components.user == nil,
      components.password == nil,
      let url = components.url
    else {
      return nil
    }
    return url.absoluteString
      .replacingOccurrences(of: "\\", with: "%5C")
      .replacingOccurrences(of: "(", with: "%28")
      .replacingOccurrences(of: ")", with: "%29")
      .replacingOccurrences(of: "[", with: "%5B")
      .replacingOccurrences(of: "]", with: "%5D")
      .replacingOccurrences(of: "!", with: "%21")
      .replacingOccurrences(of: "<", with: "%3C")
      .replacingOccurrences(of: ">", with: "%3E")
  }

  static func importablePlainText(
    _ value: String?,
    excludingURL: String?
  ) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed != excludingURL else { return nil }
    return escapeMarkdownText(trimmed)
  }

  static func attributedTextBody(
    _ value: String?,
    hasAttachments: Bool,
    existingText: String?
  ) -> String? {
    guard !hasAttachments, existingText == nil, let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  static func hasImportableContent(markdown: String) -> Bool {
    !markdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  static func isAllowedXMediaURL(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "https",
      url.user == nil,
      url.password == nil,
      url.port == nil || url.port == 443
    else {
      return false
    }
    return url.host?.lowercased() == "pbs.twimg.com"
  }

  static func isSupportedRasterImageMimeType(_ value: String) -> Bool {
    switch value.lowercased() {
    case "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic",
      "image/heif":
      return true
    default:
      return false
    }
  }

  static func detectRasterImageMimeType(_ data: Data) -> String? {
    let bytes = [UInt8](data.prefix(12))
    if bytes.starts(with: [0xFF, 0xD8, 0xFF]) {
      return "image/jpeg"
    }
    if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
      return "image/png"
    }
    if bytes.starts(with: Array("GIF87a".utf8)) || bytes.starts(with: Array("GIF89a".utf8)) {
      return "image/gif"
    }
    if bytes.count >= 12,
      Array(bytes[0..<4]) == Array("RIFF".utf8),
      Array(bytes[8..<12]) == Array("WEBP".utf8)
    {
      return "image/webp"
    }
    return nil
  }

  static func escapeMarkdownText(_ value: String) -> String {
    let escapable = Set("\\`*_{}[]()#+-.!|<>")
    var result = ""
    result.reserveCapacity(value.count)
    for character in value {
      if escapable.contains(character) {
        result.append("\\")
      }
      result.append(character)
    }
    return result
  }

  static func stripCaptionMarkup(_ value: String) -> String {
    var result = ""
    var insideTag = false
    for character in value {
      if insideTag {
        if character == ">" {
          insideTag = false
        }
        continue
      }
      if character == "<" {
        insideTag = true
        continue
      }
      result.append(character)
    }
    return result
  }

  static func decodeXMLEntitiesOnce(_ value: String) -> String {
    let source = value as NSString
    let matches = xmlEntityRegex.matches(
      in: value,
      range: NSRange(location: 0, length: source.length)
    )
    var result = value
    for match in matches.reversed() {
      let entity = source.substring(with: match.range)
      let replacement: String
      switch entity {
      case "&amp;": replacement = "&"
      case "&lt;": replacement = "<"
      case "&gt;": replacement = ">"
      case "&quot;": replacement = "\""
      case "&#39;", "&apos;": replacement = "'"
      default:
        let digits = entity.dropFirst(2).dropLast()
        if let number = UInt32(digits), let scalar = UnicodeScalar(number) {
          replacement = String(Character(scalar))
        } else {
          replacement = entity
        }
      }
      result = (result as NSString).replacingCharacters(in: match.range, with: replacement)
    }
    return result
  }
}
