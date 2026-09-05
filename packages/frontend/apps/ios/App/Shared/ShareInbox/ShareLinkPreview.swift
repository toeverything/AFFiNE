import Foundation
import ImageIO
import UIKit

struct ShareLinkPreview: Codable, Equatable {
  struct Author: Codable, Equatable {
    var name: String
    var handle: String?
    var avatar: String?

    init(name: String, handle: String? = nil, avatar: String? = nil) {
      self.name = name
      self.handle = handle
      self.avatar = avatar
    }
  }

  struct Transcript: Codable, Equatable {
    struct Segment: Codable, Equatable {
      var text: String
      var startSeconds: Double?
      var durationSeconds: Double?
      var speaker: String?

      init(
        text: String,
        startSeconds: Double? = nil,
        durationSeconds: Double? = nil,
        speaker: String? = nil
      ) {
        self.text = text
        self.startSeconds = startSeconds
        self.durationSeconds = durationSeconds
        self.speaker = speaker
      }
    }

    struct Chapter: Codable, Equatable {
      var title: String
      var startSeconds: Double
    }

    var language: String?
    var segments: [Segment]
    var chapters: [Chapter]?
    var truncated: Bool?

    init(
      language: String? = nil,
      segments: [Segment],
      chapters: [Chapter]? = nil,
      truncated: Bool? = nil
    ) {
      self.language = language
      self.segments = segments
      self.chapters = chapters
      self.truncated = truncated
    }

    var previewText: String? {
      let text =
        segments
        .map { Self.normalizedWhitespace($0.text) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
      guard !text.isEmpty else { return nil }
      guard text.count > 240 else { return text }
      return String(text.prefix(239)) + "…"
    }

    private static func normalizedWhitespace(_ value: String) -> String {
      value.split(whereSeparator: \Character.isWhitespace).joined(separator: " ")
    }
  }

  static let maxPersistedBytes = 256 * 1024
  static let maxResponseBytes = 512 * 1024
  static let maxMediaBytes = 8 * 1024 * 1024
  static let maxMediaPixels = 16 * 1024 * 1024
  static let maxMediaDimension = 8_192

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

  init(
    url: String,
    title: String? = nil,
    siteName: String? = nil,
    description: String? = nil,
    images: [String]? = nil,
    favicons: [String]? = nil,
    mediaType: String? = nil,
    provider: String? = nil,
    author: Author? = nil,
    publishedAt: String? = nil,
    durationSeconds: Double? = nil,
    transcript: Transcript? = nil
  ) {
    self.url = url
    self.title = title
    self.siteName = siteName
    self.description = description
    self.images = images
    self.favicons = favicons
    self.mediaType = mediaType
    self.provider = provider
    self.author = author
    self.publishedAt = publishedAt
    self.durationSeconds = durationSeconds
    self.transcript = transcript
  }

  var formattedDuration: String? {
    guard let duration = Self.boundedNumber(durationSeconds) else { return nil }
    let total = Int(duration.rounded(.down))
    let hours = total / 3_600
    let minutes = (total % 3_600) / 60
    let seconds = total % 60
    if hours > 0 {
      return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", seconds))"
    }
    return "\(minutes):\(String(format: "%02d", seconds))"
  }

  func persistable() -> ShareLinkPreview? {
    guard
      let normalizedURL = ShareInboxSafety.normalizedWebURL(url),
      normalizedURL.utf8.count <= Limits.url
    else { return nil }

    var value = ShareLinkPreview(
      url: normalizedURL,
      title: Self.boundedText(title, bytes: Limits.title),
      siteName: Self.boundedText(siteName, bytes: Limits.siteName),
      description: Self.boundedText(description, bytes: Limits.description),
      images: Self.proxyURLs(images),
      favicons: Self.proxyURLs(favicons),
      mediaType: Self.boundedText(mediaType, bytes: Limits.provider),
      provider: Self.boundedText(provider, bytes: Limits.provider),
      author: Self.boundedAuthor(author),
      publishedAt: Self.boundedText(publishedAt, bytes: Limits.publishedAt),
      durationSeconds: Self.boundedNumber(durationSeconds),
      transcript: Self.boundedTranscript(transcript)
    )
    value.removeTrailingTranscriptContentUntilEncodable()
    return value.encodedSize() <= Self.maxPersistedBytes ? value : nil
  }

  func validatedPersistedSnapshot() -> ShareLinkPreview? {
    guard let validated = persistable(), validated == self else { return nil }
    return self
  }

  static func isOfficialMediaURL(_ value: String) -> Bool {
    guard
      value.utf8.count <= Limits.url,
      let components = URLComponents(string: value),
      components.scheme?.lowercased() == "https",
      components.host?.lowercased() == "app.affine.pro",
      components.user == nil,
      components.password == nil,
      components.port == nil || components.port == 443,
      components.path == "/api/worker/image-proxy"
    else { return false }
    return true
  }

  private mutating func removeTrailingTranscriptContentUntilEncodable() {
    while encodedSize() > Self.maxPersistedBytes {
      guard var transcript else { return }
      guard !transcript.segments.isEmpty else {
        self.transcript = nil
        continue
      }
      transcript.segments.removeLast()
      transcript.truncated = true
      if let finalStart = transcript.segments.last?.startSeconds {
        transcript.chapters = transcript.chapters?.filter { $0.startSeconds <= finalStart }
      } else {
        transcript.chapters = nil
      }
      self.transcript = transcript.segments.isEmpty ? nil : transcript
    }
  }

  private func encodedSize() -> Int {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return (try? encoder.encode(self).count) ?? .max
  }

  private static func boundedAuthor(_ value: Author?) -> Author? {
    guard let name = boundedText(value?.name, bytes: Limits.author) else { return nil }
    return Author(
      name: name,
      handle: boundedText(value?.handle, bytes: Limits.author),
      avatar: value?.avatar.flatMap { isOfficialMediaURL($0) ? $0 : nil }
    )
  }

  private static func boundedTranscript(_ value: Transcript?) -> Transcript? {
    guard let value else { return nil }
    let segments = value.segments.prefix(Limits.segments).compactMap {
      segment -> Transcript.Segment? in
      guard let text = boundedText(segment.text, bytes: Limits.segmentText) else { return nil }
      return Transcript.Segment(
        text: text,
        startSeconds: boundedNumber(segment.startSeconds),
        durationSeconds: boundedNumber(segment.durationSeconds),
        speaker: boundedText(segment.speaker, bytes: Limits.speaker)
      )
    }
    guard !segments.isEmpty else { return nil }
    let chapters = value.chapters?.prefix(Limits.chapters).compactMap {
      chapter -> Transcript.Chapter? in
      guard
        let title = boundedText(chapter.title, bytes: Limits.title),
        let start = boundedNumber(chapter.startSeconds)
      else { return nil }
      return Transcript.Chapter(title: title, startSeconds: start)
    }
    return Transcript(
      language: boundedText(value.language, bytes: Limits.language),
      segments: Array(segments),
      chapters: chapters.map(Array.init),
      truncated: value.truncated
    )
  }

  private static func proxyURLs(_ values: [String]?) -> [String]? {
    guard let values else { return nil }
    return Array(values.filter(isOfficialMediaURL).prefix(Limits.urls))
  }

  private static func boundedNumber(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value >= 0, value <= Limits.duration else { return nil }
    return value
  }

  private static func boundedText(_ value: String?, bytes: Int) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if trimmed.utf8.count <= bytes { return trimmed }
    var result = ""
    var count = 0
    for character in trimmed {
      let size = String(character).utf8.count
      guard count + size <= bytes else { break }
      result.append(character)
      count += size
    }
    return result.isEmpty ? nil : result
  }

  private enum Limits {
    static let url = 8_192
    static let urls = 8
    static let title = 4_096
    static let description = 32_768
    static let provider = 256
    static let siteName = 512
    static let author = 512
    static let publishedAt = 128
    static let language = 128
    static let segmentText = 16_384
    static let speaker = 512
    static let segments = 500
    static let chapters = 100
    static let duration = Double(7 * 24 * 60 * 60)
  }
}

private final class SharePreviewTaskBox: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  private var task: URLSessionTask?

  func install(_ task: URLSessionTask) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    self.task = task
    return !cancelled
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let task = task
    lock.unlock()
    task?.cancel()
  }
}

private final class SharePreviewSessionDelegate: NSObject, URLSessionDataDelegate,
  URLSessionTaskDelegate, @unchecked Sendable
{
  private struct Transfer {
    let limit: Int
    let continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>
    var data = Data()
    var response: HTTPURLResponse?
  }

  private let lock = NSLock()
  private var transfers: [Int: Transfer] = [:]

  func data(
    for request: URLRequest,
    limit: Int,
    session: URLSession
  ) async throws -> (Data, HTTPURLResponse) {
    let box = SharePreviewTaskBox()
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        let task = session.dataTask(with: request)
        lock.lock()
        transfers[task.taskIdentifier] = Transfer(
          limit: limit,
          continuation: continuation
        )
        lock.unlock()
        if box.install(task), !Task.isCancelled {
          task.resume()
        } else {
          box.cancel()
        }
      }
    } onCancel: {
      box.cancel()
    }
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let response = response as? HTTPURLResponse else {
      finish(dataTask, with: URLError(.badServerResponse))
      completionHandler(.cancel)
      return
    }

    lock.lock()
    guard var transfer = transfers[dataTask.taskIdentifier] else {
      lock.unlock()
      completionHandler(.cancel)
      return
    }
    if response.expectedContentLength > Int64(transfer.limit) {
      let continuation = transfer.continuation
      transfers.removeValue(forKey: dataTask.taskIdentifier)
      lock.unlock()
      completionHandler(.cancel)
      continuation.resume(throwing: URLError(.dataLengthExceedsMaximum))
      return
    }
    transfer.response = response
    transfers[dataTask.taskIdentifier] = transfer
    lock.unlock()
    completionHandler(.allow)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive data: Data
  ) {
    lock.lock()
    guard var transfer = transfers[dataTask.taskIdentifier] else {
      lock.unlock()
      return
    }
    guard data.count <= transfer.limit - transfer.data.count else {
      let continuation = transfer.continuation
      transfers.removeValue(forKey: dataTask.taskIdentifier)
      lock.unlock()
      dataTask.cancel()
      continuation.resume(throwing: URLError(.dataLengthExceedsMaximum))
      return
    }
    transfer.data.append(data)
    transfers[dataTask.taskIdentifier] = transfer
    lock.unlock()
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    lock.lock()
    guard let transfer = transfers.removeValue(forKey: task.taskIdentifier) else {
      lock.unlock()
      return
    }
    lock.unlock()
    if let error {
      transfer.continuation.resume(throwing: error)
    } else if let response = transfer.response {
      transfer.continuation.resume(returning: (transfer.data, response))
    } else {
      transfer.continuation.resume(throwing: URLError(.badServerResponse))
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection newResponse: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  private func finish(_ task: URLSessionTask, with error: Error) {
    lock.lock()
    let transfer = transfers.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    transfer?.continuation.resume(throwing: error)
  }
}

struct ShareLinkPreviewClient {
  private let session: URLSession
  private let delegate: SharePreviewSessionDelegate
  private let appVersion: String

  init(
    configuration: URLSessionConfiguration? = nil,
    appVersion: String? = nil
  ) {
    let configuration = configuration ?? .ephemeral
    configuration.timeoutIntervalForRequest = 4
    configuration.timeoutIntervalForResource = 6
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCredentialStorage = nil
    let delegate = SharePreviewSessionDelegate()
    self.delegate = delegate
    self.session = URLSession(
      configuration: configuration,
      delegate: delegate,
      delegateQueue: nil
    )
    self.appVersion = appVersion ?? Self.bundledAppVersion
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
    let (data, response) = try await delegate.data(
      for: request,
      limit: ShareLinkPreview.maxResponseBytes,
      session: session
    )
    guard
      response.statusCode == 200,
      response.mimeType?.lowercased() == "application/json"
    else { throw URLError(.badServerResponse) }
    let decoded = try JSONDecoder().decode(ShareLinkPreview.self, from: data)
    guard let preview = decoded.persistable() else {
      throw URLError(.cannotParseResponse)
    }
    return preview
  }

  func fetchImage(url value: String) async throws -> UIImage {
    guard ShareLinkPreview.isOfficialMediaURL(value), let url = URL(string: value) else {
      throw URLError(.badURL)
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    addClientHeaders(to: &request)
    let (data, response) = try await delegate.data(
      for: request,
      limit: ShareLinkPreview.maxMediaBytes,
      session: session
    )
    guard
      response.statusCode == 200,
      response.url.map({ ShareLinkPreview.isOfficialMediaURL($0.absoluteString) }) == true,
      response.value(forHTTPHeaderField: "Content-Type")?
        .lowercased().hasPrefix("image/") == true,
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
        as? [CFString: Any],
      let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
      let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
      width > 0,
      height > 0,
      width <= ShareLinkPreview.maxMediaDimension,
      height <= ShareLinkPreview.maxMediaDimension,
      width * height <= ShareLinkPreview.maxMediaPixels,
      let image = UIImage(data: data)
    else { throw URLError(.cannotDecodeContentData) }
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
