import Foundation
import UniformTypeIdentifiers

enum ShareInboxSafety {
  static func manifestTitle(original: String, userEdited: String?) -> String {
    (userEdited ?? original).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func previewTitle(original: String, userEdited: String?, serverTitle: String?) -> String {
    userEdited ?? serverTitle ?? original
  }

  static func normalizedManifestID(_ value: String) -> String? {
    UUID(uuidString: value)?.uuidString
  }

  static func manifestSchemaVersion(from data: Data) -> Int? {
    guard let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    guard let schemaVersion = manifest["schemaVersion"] else { return 1 }
    return schemaVersion as? Int
  }

  static func normalizedWebURL(_ value: String) -> String? {
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
  }

  static func previewRoute(url: String, mode: ShareWorkspaceMode) -> SharePreviewRoute {
    guard normalizedWebURL(url) != nil else { return .deferred }
    if isOfficialPreviewURL(url) || mode == .cloudOnly || mode == .signedOut {
      return .official
    }
    return .deferred
  }

  static func isOfficialPreviewURL(_ value: String) -> Bool {
    guard let normalized = normalizedWebURL(value), let url = URL(string: normalized) else {
      return false
    }
    let host = url.host?.lowercased()
    let components = url.pathComponents.filter { $0 != "/" }
    if host == "youtu.be" {
      return components.count == 1 && !components[0].isEmpty
    }
    if ["youtube.com", "www.youtube.com", "m.youtube.com"].contains(host) {
      if url.path == "/watch" {
        return !(URLComponents(url: url, resolvingAgainstBaseURL: false)?
          .queryItems?.first(where: { $0.name == "v" })?.value?.isEmpty ?? true)
      }
      return components.count == 2
        && ["shorts", "live", "embed"].contains(components[0])
        && !components[1].isEmpty
    }
    if ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].contains(host) {
      return components.count == 3 && components[1] == "status"
        && !components[2].isEmpty && components[2].allSatisfy { $0.isASCII && $0.isNumber }
    }
    return false
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
       Array(bytes[0 ..< 4]) == Array("RIFF".utf8),
       Array(bytes[8 ..< 12]) == Array("WEBP".utf8)
    {
      return "image/webp"
    }
    if bytes.count >= 12, Array(bytes[4 ..< 8]) == Array("ftyp".utf8) {
      let brand = String(decoding: bytes[8 ..< 12], as: UTF8.self).lowercased()
      if ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].contains(brand) {
        return "image/heic"
      }
    }
    return nil
  }

  static func isPDFTypeIdentifier(_ value: String) -> Bool {
    UTType(value)?.conforms(to: .pdf) == true
  }

  static func detectPDFMimeType(_ data: Data) -> String? {
    data.starts(with: Data("%PDF-".utf8)) ? "application/pdf" : nil
  }
}
