import Foundation

enum ShareInboxSafety {
  static func normalizedManifestID(_ value: String) -> String? {
    UUID(uuidString: value)?.uuidString
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
    if bytes.count >= 12, Array(bytes[4..<8]) == Array("ftyp".utf8) {
      let brand = String(decoding: bytes[8..<12], as: UTF8.self).lowercased()
      if ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].contains(brand) {
        return "image/heic"
      }
    }
    return nil
  }
}
