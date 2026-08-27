import Foundation
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
}

extension ShareLinkPreview.Transcript {
  var previewText: String? {
    let text = segments
      .map { $0.text.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
      .filter { !$0.isEmpty }
      .joined(separator: " ")
    guard !text.isEmpty else { return nil }
    guard text.count > 240 else { return text }
    return String(text.prefix(240)) + "…"
  }
}

enum ShareLinkPreviewState: Equatable {
  case idle
  case deferred
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
    let (data, response) = try await session.data(for: request)
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
    var request = URLRequest(
      url: url,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 3
    )
    addClientHeaders(to: &request)
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      throw URLError(.badServerResponse)
    }
    guard let image = UIImage(data: data) else {
      throw URLError(.cannotDecodeContentData)
    }
    return image
  }

  func fetchImageIfPresent(url: String?) async -> UIImage? {
    guard let url else { return nil }
    return try? await fetchImage(url: url)
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
