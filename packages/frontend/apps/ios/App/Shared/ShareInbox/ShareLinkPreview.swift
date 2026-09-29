import Foundation
import ImageIO
import UIKit

struct ShareLinkPreview: Decodable, Equatable {
  struct Author: Decodable, Equatable {
    var name: String
    var handle: String?
    var avatar: String?
  }

  struct Transcript: Decodable, Equatable {
    struct Segment: Decodable, Equatable {
      var text: String
      var startSeconds: Double?
      var durationSeconds: Double?
      var speaker: String?
    }

    struct Chapter: Decodable, Equatable {
      var title: String
      var startSeconds: Double
    }

    var language: String?
    var segments: [Segment]
    var chapters: [Chapter]?
    var truncated: Bool?
  }

  var url: String
  var title: String?
  var siteName: String?
  var description: String?
  var images: [String]?
  var favicons: [String]?
  var mediaType: String?
  var provider: String?
  var author: Author?
  var publishedAt: String?
  var durationSeconds: Double?
  var transcript: Transcript?

  private enum CodingKeys: String, CodingKey {
    case url, title, siteName, description, images, favicons, mediaType, provider
    case author, publishedAt, durationSeconds, transcript
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let rawURL = try values.decode(String.self, forKey: .url)
    guard let normalized = ShareInboxSafety.normalizedWebURL(rawURL) else {
      throw DecodingError.dataCorruptedError(forKey: .url, in: values, debugDescription: "Invalid preview URL")
    }
    url = normalized
    func text(_ key: CodingKeys, limit: Int) -> String? {
      guard let value = try? values.decode(String.self, forKey: key),
            let text = SharePayloadBuilder.nonEmpty(value) else { return nil }
      return String(text.prefix(limit))
    }
    title = text(.title, limit: 120)
    siteName = text(.siteName, limit: 80)
    description = text(.description, limit: 500)
    mediaType = text(.mediaType, limit: 80)
    provider = text(.provider, limit: 80)
    publishedAt = text(.publishedAt, limit: 80)
    images = (try? values.decode([String].self, forKey: .images))?
      .compactMap(ShareInboxSafety.normalizedWebURL).prefix(1).map { $0 }
    favicons = (try? values.decode([String].self, forKey: .favicons))?
      .compactMap(ShareInboxSafety.normalizedWebURL).prefix(1).map { $0 }
    author = try? values.decode(Author.self, forKey: .author)
    if let name = author?.name { author?.name = String(name.prefix(80)) }
    durationSeconds = try? values.decode(Double.self, forKey: .durationSeconds)
    if let duration = durationSeconds, !duration.isFinite || duration < 0 { durationSeconds = nil }
    if let source = try? values.decode(Transcript.self, forKey: .transcript), let excerpt = source.previewText {
      transcript = Transcript(language: source.language, segments: [Transcript.Segment(text: excerpt)], chapters: nil, truncated: nil)
    }
  }
}

extension ShareLinkPreview.Transcript {
  var previewText: String? {
    var text = ""
    for segment in segments {
      let part = String(segment.text.prefix(241)).split(whereSeparator: \.isWhitespace).joined(separator: " ")
      if part.isEmpty { continue }
      if !text.isEmpty { text += " " }
      text += part
      if text.count > 240 { return String(text.prefix(240)) + "…" }
    }
    return text.isEmpty ? nil : text
  }
}

enum ShareLinkPreviewState: Equatable {
  case idle
  case loading
  case loaded(ShareLinkPreview)
  case failed
}

struct ShareLinkPreviewClient {
  private let session: URLSession
  private let appVersion: String

  init(session: URLSession? = nil, appVersion: String? = nil) {
    self.appVersion = appVersion ?? Self.bundledAppVersion
    if let session {
      self.session = session
    } else {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.timeoutIntervalForRequest = 4
      configuration.timeoutIntervalForResource = 6
      configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
      configuration.urlCache = nil
      self.session = URLSession(configuration: configuration)
    }
  }

  func fetch(url: String) async throws -> ShareLinkPreview {
    guard let normalized = ShareInboxSafety.normalizedWebURL(url) else {
      throw URLError(.badURL)
    }
    var request = URLRequest(url: ShareInboxConstants.officialLinkPreviewURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    addClientHeaders(to: &request)
    request.httpBody = try JSONEncoder().encode(
      Request(url: normalized, include: ["transcript"])
    )
    let (data, response) = try await read(request, maxBytes: 1024 * 1024)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      throw URLError(.badServerResponse)
    }
    return try JSONDecoder().decode(ShareLinkPreview.self, from: data)
  }

  func fetchImage(url value: String) async throws -> UIImage {
    guard let candidate = URL(
      string: value,
      relativeTo: ShareInboxConstants.officialLinkPreviewURL
    ) else {
      throw URLError(.badURL)
    }
    let resolved = candidate.absoluteURL
    guard
      let normalized = ShareInboxSafety.normalizedWebURL(resolved.absoluteString),
      let url = URL(string: normalized)
    else {
      throw URLError(.badURL)
    }
    guard url.scheme == "https",
          url.host == ShareInboxConstants.officialLinkPreviewURL.host,
          url.port == ShareInboxConstants.officialLinkPreviewURL.port,
          url.path == "/api/worker/image-proxy"
    else { throw URLError(.badURL) }
    var request = URLRequest(
      url: url,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 3
    )
    addClientHeaders(to: &request)
    let (data, response) = try await read(request, maxBytes: 2 * 1024 * 1024)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      throw URLError(.badServerResponse)
    }
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 480,
          ] as CFDictionary)
    else {
      throw URLError(.cannotDecodeContentData)
    }
    return UIImage(cgImage: thumbnail)
  }

  func fetchImageIfPresent(url: String?) async -> UIImage? {
    guard let url else { return nil }
    return try? await fetchImage(url: url)
  }

  private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_: URLSession, task _: URLSessionTask,
                    willPerformHTTPRedirection _: HTTPURLResponse, newRequest _: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void)
    {
      completionHandler(nil)
    }
  }

  private func read(_ request: URLRequest, maxBytes: Int) async throws -> (Data, URLResponse) {
    let (bytes, response) = try await session.bytes(for: request, delegate: NoRedirect())
    defer { bytes.task.cancel() }
    guard response.expectedContentLength <= maxBytes else { throw URLError(.dataLengthExceedsMaximum) }
    var data = Data()
    var buffer = [UInt8]()
    let chunkSize = 16 * 1024
    buffer.reserveCapacity(chunkSize)
    for try await byte in bytes {
      guard data.count + buffer.count < maxBytes else { throw URLError(.dataLengthExceedsMaximum) }
      buffer.append(byte)
      if buffer.count == chunkSize {
        data.append(contentsOf: buffer)
        buffer.removeAll(keepingCapacity: true)
      }
    }
    data.append(contentsOf: buffer)
    return (data, response)
  }

  private func addClientHeaders(to request: inout URLRequest) {
    request.setValue("AFFiNE/\(appVersion)", forHTTPHeaderField: "User-Agent")
    request.setValue(appVersion, forHTTPHeaderField: "x-affine-version")
  }

  private struct Request: Encodable {
    var url: String
    var include: [String]
  }

  private struct AppConfig: Decodable {
    var affineVersion: String
  }

  private static var bundledAppVersion: String {
    if let url = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
       let data = try? Data(contentsOf: url),
       let version = try? JSONDecoder().decode(AppConfig.self, from: data).affineVersion,
       !version.isEmpty
    {
      return version
    }
    if let version = Bundle.main.object(
      forInfoDictionaryKey: "CFBundleShortVersionString"
    ) as? String, !version.isEmpty {
      return version
    }
    return "0.2"
  }
}
