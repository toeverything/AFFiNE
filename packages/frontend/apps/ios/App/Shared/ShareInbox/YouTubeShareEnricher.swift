//
//  YouTubeShareEnricher.swift
//  Shared between AFFiNE and ShareExtension
//
//  Best-effort YouTube enrichment (no API key):
//  thumbnail + description + timestamped transcript.
//

import Foundation

enum YouTubeShareEnricher {
  struct Result: Equatable {
    var title: String
    var description: String
    var transcriptMarkdown: String
    var thumbnailData: Data?
    var thumbnailMimeType: String
    var sourceURL: String

    var hasUsefulContent: Bool {
      !description.isEmpty || !transcriptMarkdown.isEmpty || thumbnailData != nil
    }
  }

  private struct CaptionTrack {
    var baseURL: String
    var languageCode: String
    var kind: String?
    var name: String
  }

  private struct TimedLine: Equatable {
    var startSeconds: Double
    var text: String
  }

  private struct Chapter: Equatable {
    var startSeconds: Double
    var title: String
  }

  static func videoId(from urlString: String) -> String? {
    guard let url = URL(string: urlString) else { return nil }
    return videoId(from: url)
  }

  static func videoId(from url: URL) -> String? {
    let host = (url.host ?? "").lowercased()
    guard host.contains("youtube.com") || host == "youtu.be" || host.contains("youtube-nocookie.com")
    else {
      return nil
    }

    if host == "youtu.be" {
      let id = url.path.split(separator: "/").first.map(String.init)
      return sanitizeVideoId(id)
    }

    let path = url.path
    if path.hasPrefix("/shorts/"),
       let id = path.split(separator: "/").dropFirst().first.map(String.init)
    {
      return sanitizeVideoId(id)
    }
    if path.hasPrefix("/embed/"),
       let id = path.split(separator: "/").dropFirst().first.map(String.init)
    {
      return sanitizeVideoId(id)
    }
    if path.hasPrefix("/live/"),
       let id = path.split(separator: "/").dropFirst().first.map(String.init)
    {
      return sanitizeVideoId(id)
    }

    if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
       let id = components.queryItems?.first(where: { $0.name == "v" })?.value
    {
      return sanitizeVideoId(id)
    }
    return nil
  }

  static func isYouTubeURL(_ urlString: String) -> Bool {
    videoId(from: urlString) != nil
  }

  struct Seed {
    var title: String?
    var description: String?
    var transcriptMarkdown: String?
  }

  static func enrich(urlString: String, seed: Seed? = nil) async -> Result? {
    guard let videoId = videoId(from: urlString) else { return nil }
    let canonicalURL = "https://www.youtube.com/watch?v=\(videoId)"

    async let oembedTask = fetchOEmbed(videoURL: canonicalURL)
    async let playerTask = fetchPlayerResponse(videoId: videoId)

    let oembed = await oembedTask
    let player = await playerTask

    let title = cleanTitle(
      nonEmpty(seed?.title)
        ?? oembed?.title
        ?? player?.title
        ?? "YouTube"
    )
    let description = (
      nonEmpty(seed?.description)
        ?? player?.description
        ?? oembed?.description
        ?? ""
    )
    .trimmingCharacters(in: .whitespacesAndNewlines)

    var thumbnailData = await fetchThumbnailData(
      preferredURL: oembed?.thumbnailURL,
      videoId: videoId
    )
    if thumbnailData == nil, let fallback = player?.thumbnailURL {
      thumbnailData = await fetchData(from: fallback)
    }

    let seededTranscript = nonEmpty(seed?.transcriptMarkdown) ?? ""
    let transcriptMarkdown: String
    if !seededTranscript.isEmpty {
      transcriptMarkdown = seededTranscript
    } else if let transcript = await fetchBestTranscript(
      videoId: videoId,
      player: player
    ), !transcript.isEmpty
    {
      transcriptMarkdown = transcript
    } else {
      transcriptMarkdown = ""
    }

    let result = Result(
      title: title,
      description: description,
      transcriptMarkdown: transcriptMarkdown,
      thumbnailData: thumbnailData,
      thumbnailMimeType: "image/jpeg",
      sourceURL: canonicalURL
    )
    return result.hasUsefulContent ? result : nil
  }

  private static func nonEmpty(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  static func buildMarkdown(from result: Result) -> String {
    var parts: [String] = []
    parts.append("[Source](\(result.sourceURL))")
    if result.thumbnailData != nil {
      parts.append("![Thumbnail](attachment://youtube-thumbnail)")
    }
    if !result.description.isEmpty {
      parts.append(result.description)
    }
    if !result.transcriptMarkdown.isEmpty {
      parts.append("## Transcript")
      parts.append(result.transcriptMarkdown)
    }
    return parts
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: "\n\n")
  }

  static func thumbnailFile(from result: Result) -> SharePayloadFile? {
    guard let data = result.thumbnailData, !data.isEmpty else { return nil }
    return SharePayloadFile(
      data: data,
      mimeType: result.thumbnailMimeType,
      fileName: "youtube-thumbnail.jpg",
      placeholder: "attachment://youtube-thumbnail",
      embedInMarkdownAsImage: true
    )
  }

  // MARK: - Networking

  private struct OEmbedPayload {
    var title: String?
    var thumbnailURL: String?
    var description: String?
  }

  private struct PlayerPayload {
    var title: String?
    var description: String?
    var thumbnailURL: String?
    var captionTracks: [CaptionTrack]
    var chapters: [Chapter]
  }

  private static func fetchOEmbed(videoURL: String) async -> OEmbedPayload? {
    guard var components = URLComponents(string: "https://www.youtube.com/oembed") else {
      return nil
    }
    components.queryItems = [
      URLQueryItem(name: "url", value: videoURL),
      URLQueryItem(name: "format", value: "json"),
    ]
    guard let url = components.url,
          let data = await fetchData(from: url.absoluteString),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    return OEmbedPayload(
      title: json["title"] as? String,
      thumbnailURL: json["thumbnail_url"] as? String,
      description: nil
    )
  }

  private static func fetchPlayerResponse(videoId: String) async -> PlayerPayload? {
    // Desktop HTML is more likely to include captionTracks than the mobile watch page.
    let watchURL = "https://www.youtube.com/watch?v=\(videoId)&hl=en&bpctr=9999999999&has_verified=1"
    guard let htmlData = await fetchData(
      from: watchURL,
      userAgent: desktopUserAgent
    ),
      let html = String(data: htmlData, encoding: .utf8)
        ?? String(data: htmlData, encoding: .isoLatin1)
    else {
      return nil
    }

    let playerObject = extractJSONObject(named: "ytInitialPlayerResponse", from: html)
    let initialDataObject = extractJSONObject(named: "ytInitialData", from: html)
    guard let jsonObject = playerObject ?? initialDataObject else { return nil }

    // Prefer player response shape for details/captions, while initial data carries chapters.
    let root: [String: Any]
    if let playerObject, playerObject["videoDetails"] != nil {
      root = playerObject
    } else if jsonObject["videoDetails"] != nil {
      root = jsonObject
    } else if let player = findPlayerResponse(in: jsonObject) {
      root = player
    } else {
      root = jsonObject
    }

    let details = root["videoDetails"] as? [String: Any]
    let title = details?["title"] as? String
    let description = details?["shortDescription"] as? String

    var thumbnailURL: String?
    if let thumbnails = (details?["thumbnail"] as? [String: Any])?["thumbnails"] as? [[String: Any]] {
      thumbnailURL = thumbnails.last?["url"] as? String ?? thumbnails.first?["url"] as? String
    }

    var tracks: [CaptionTrack] = []
    if let captions = root["captions"] as? [String: Any],
       let renderer = captions["playerCaptionsTracklistRenderer"] as? [String: Any],
       let captionTracks = renderer["captionTracks"] as? [[String: Any]]
    {
      tracks = parseCaptionTracks(captionTracks)
    }

    return PlayerPayload(
      title: title,
      description: description,
      thumbnailURL: thumbnailURL,
      captionTracks: tracks,
      chapters: extractChapters(from: initialDataObject ?? jsonObject)
    )
  }

  private static func extractChapters(from object: [String: Any]) -> [Chapter] {
    var chapters: [Chapter] = []
    let roots = [
      object["playerOverlays"],
      object["playerOverlayRenderer"],
      object["engagementPanels"],
      object["decoratedPlayerBarRenderer"],
      object["macroMarkersListRenderer"],
    ].compactMap { $0 }

    for root in roots {
      collectChapters(from: root, maxDepth: 8, into: &chapters)
    }

    var seen = Set<String>()
    return chapters
      .filter { !$0.title.isEmpty }
      .sorted { $0.startSeconds < $1.startSeconds }
      .filter { chapter in
        let key = "\(Int(chapter.startSeconds.rounded())):\(chapter.title.lowercased())"
        if seen.contains(key) { return false }
        seen.insert(key)
        return true
      }
  }

  private static func collectChapters(from value: Any, maxDepth: Int, into chapters: inout [Chapter]) {
    guard maxDepth >= 0 else { return }
    if let dictionary = value as? [String: Any] {
      if let renderer = dictionary["chapterRenderer"] as? [String: Any],
         let chapter = parseChapterRenderer(renderer)
      {
        chapters.append(chapter)
      }
      if let renderer = dictionary["macroMarkersListItemRenderer"] as? [String: Any],
         let chapter = parseMacroMarkerRenderer(renderer)
      {
        chapters.append(chapter)
      }
      if let chapter = parseChapterRenderer(dictionary) {
        chapters.append(chapter)
      }

      for key in chapterContainerKeys {
        if let nested = dictionary[key] {
          collectChapters(from: nested, maxDepth: maxDepth - 1, into: &chapters)
        }
      }
    } else if let array = value as? [Any] {
      for nested in array {
        collectChapters(from: nested, maxDepth: maxDepth - 1, into: &chapters)
      }
    }
  }

  private static let chapterContainerKeys = [
    "playerOverlayRenderer",
    "decoratedPlayerBarRenderer",
    "playerBar",
    "multiMarkersPlayerBarRenderer",
    "markersMap",
    "macroMarkersListRenderer",
    "contents",
    "items",
    "value",
    "chapters",
    "chapterRenderer",
    "macroMarkersListItemRenderer",
  ]

  private static func parseChapterRenderer(_ renderer: [String: Any]) -> Chapter? {
    guard let title = textValue(renderer["title"]), !title.isEmpty,
          let millis = renderer["timeRangeStartMillis"] as? Double
            ?? (renderer["timeRangeStartMillis"] as? Int).map(Double.init)
    else {
      return nil
    }
    return Chapter(startSeconds: millis / 1000, title: title)
  }

  private static func parseMacroMarkerRenderer(_ renderer: [String: Any]) -> Chapter? {
    guard let title = textValue(renderer["title"]), !title.isEmpty,
          let timeText = textValue(renderer["timeDescription"])
    else {
      return nil
    }
    return Chapter(startSeconds: parseTimestampText(timeText), title: title)
  }

  private static func textValue(_ value: Any?) -> String? {
    if let string = value as? String {
      return string.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if let dictionary = value as? [String: Any] {
      if let simple = dictionary["simpleText"] as? String {
        return simple.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      if let runs = dictionary["runs"] as? [[String: Any]] {
        return runs
          .compactMap { $0["text"] as? String }
          .joined()
          .trimmingCharacters(in: .whitespacesAndNewlines)
      }
    }
    return nil
  }

  private static func parseTimestampText(_ value: String) -> Double {
    let parts = value.split(separator: ":").compactMap { Double($0) }
    if parts.count == 3 {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    if parts.count == 2 {
      return parts[0] * 60 + parts[1]
    }
    return parts.first ?? 0
  }

  private static func findPlayerResponse(in object: [String: Any]) -> [String: Any]? {
    if object["videoDetails"] != nil, object["captions"] != nil || object["streamingData"] != nil {
      return object
    }
    for value in object.values {
      if let dict = value as? [String: Any], let found = findPlayerResponse(in: dict) {
        return found
      }
      if let array = value as? [Any] {
        for item in array {
          if let dict = item as? [String: Any], let found = findPlayerResponse(in: dict) {
            return found
          }
        }
      }
    }
    return nil
  }

  private static func fetchThumbnailData(preferredURL: String?, videoId: String) async -> Data? {
    var candidates: [String] = []
    if let preferredURL, !preferredURL.isEmpty {
      candidates.append(preferredURL)
    }
    candidates.append(contentsOf: [
      "https://i.ytimg.com/vi/\(videoId)/maxresdefault.jpg",
      "https://i.ytimg.com/vi/\(videoId)/hqdefault.jpg",
      "https://i.ytimg.com/vi/\(videoId)/mqdefault.jpg",
    ])

    for candidate in candidates {
      if let data = await fetchData(from: candidate), !data.isEmpty, data.count > 1000 {
        return data
      }
    }
    return nil
  }

  private static let mobileUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  private static let desktopUserAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
  private static func fetchData(
    from urlString: String,
    userAgent: String = mobileUserAgent
  ) async -> Data? {
    guard let url = URL(string: urlString) else { return nil }
    var request = URLRequest(url: url)
    request.timeoutInterval = 12
    request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
        return nil
      }
      return data
    } catch {
      return nil
    }
  }

  // MARK: - Captions

  private static func fetchBestTranscript(
    videoId: String,
    player: PlayerPayload?
  ) async -> String? {
    let tracks = player?.captionTracks ?? []
    guard let selected = selectCaptionTrack(tracks),
          let lines = await fetchTranscript(from: selected),
          !lines.isEmpty
    else {
      return nil
    }
    return formatTranscript(lines, chapters: player?.chapters ?? [])
  }

  private static func parseCaptionTracks(_ captionTracks: [[String: Any]]) -> [CaptionTrack] {
    captionTracks.compactMap { track in
      guard let baseURL = track["baseUrl"] as? String, !baseURL.isEmpty else { return nil }
      let name = textValue(track["name"]) ?? track["languageCode"] as? String ?? "unknown"
      return CaptionTrack(
        baseURL: baseURL.replacingOccurrences(of: "\\u0026", with: "&"),
        languageCode: (track["languageCode"] as? String ?? "").lowercased(),
        kind: track["kind"] as? String,
        name: name
      )
    }
  }

  private static func fetchTranscript(from track: CaptionTrack) async -> [TimedLine]? {
    var candidates: [String] = []
    if track.baseURL.contains("fmt=") {
      candidates.append(track.baseURL)
    } else {
      candidates.append(track.baseURL + "&fmt=json3")
      candidates.append(track.baseURL + "&fmt=vtt")
      candidates.append(track.baseURL + "&fmt=srv3")
      candidates.append(track.baseURL)
    }
    for candidate in candidates {
      guard let data = await fetchData(from: candidate, userAgent: desktopUserAgent),
            let lines = parseCaptions(data: data),
            !lines.isEmpty
      else {
        continue
      }
      return lines
    }
    return nil
  }

  private static func selectCaptionTrack(_ tracks: [CaptionTrack]) -> CaptionTrack? {
    let preferredLanguages = ["en", "en-us", "en-gb", "zh-hans", "zh-cn", "zh-hant", "zh-tw", "zh"]
    let manual = tracks.filter { ($0.kind ?? "") != "asr" }
    let asr = tracks.filter { ($0.kind ?? "") == "asr" }

    for lang in preferredLanguages {
      if let match = manual.first(where: { $0.languageCode == lang || $0.languageCode.hasPrefix(lang + "-") }) {
        return match
      }
    }
    if let firstManual = manual.first { return firstManual }
    for lang in preferredLanguages {
      if let match = asr.first(where: { $0.languageCode == lang || $0.languageCode.hasPrefix(lang + "-") }) {
        return match
      }
    }
    return asr.first ?? tracks.first
  }

  private static func parseCaptions(data: Data) -> [TimedLine]? {
    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let lines = parseJSON3Captions(json),
       !lines.isEmpty
    {
      return lines
    }
    if let xml = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) {
      if xml.contains("<text") || xml.contains("<p ") {
        return parseTimedTextXML(xml)
      }
      if xml.contains("WEBVTT") || xml.contains("-->") {
        return parseVTT(xml)
      }
    }
    return nil
  }

  private static func parseJSON3Captions(_ json: [String: Any]) -> [TimedLine]? {
    guard let events = json["events"] as? [[String: Any]] else { return nil }
    var lines: [TimedLine] = []
    for event in events {
      guard let segs = event["segs"] as? [[String: Any]] else { continue }
      let text = segs
        .compactMap { $0["utf8"] as? String }
        .joined()
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { continue }
      let startMs = event["tStartMs"] as? Double
        ?? (event["tStartMs"] as? Int).map(Double.init)
        ?? 0
      lines.append(TimedLine(startSeconds: startMs / 1000, text: text))
    }
    return mergeCaptionLines(lines)
  }

  private static func parseTimedTextXML(_ xml: String) -> [TimedLine] {
    var lines: [TimedLine] = []
    let pattern = #"<text\b([^>]*)>([\s\S]*?)</text>"#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return [] }
    let ns = xml as NSString
    let matches = regex.matches(in: xml, options: [], range: NSRange(location: 0, length: ns.length))
    for match in matches {
      guard match.numberOfRanges >= 3 else { continue }
      let attrs = ns.substring(with: match.range(at: 1))
      let rawText = ns.substring(with: match.range(at: 2))
      let start = attributeValue("start", in: attrs).flatMap(Double.init) ?? 0
      let text = decodeXMLEntities(stripHTML(rawText))
        .replacingOccurrences(of: "\n", with: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { continue }
      lines.append(TimedLine(startSeconds: start, text: text))
    }
    return mergeCaptionLines(lines)
  }

  private static func parseVTT(_ vtt: String) -> [TimedLine] {
    var lines: [TimedLine] = []
    let blocks = vtt.components(separatedBy: "\n\n")
    let timePattern = #"(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+"#
    guard let timeRegex = try? NSRegularExpression(pattern: timePattern) else { return [] }

    for block in blocks {
      let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, !trimmed.hasPrefix("WEBVTT"), !trimmed.hasPrefix("NOTE") else { continue }
      let blockLines = trimmed.components(separatedBy: "\n")
      guard let timeLine = blockLines.first(where: { $0.contains("-->") }) else { continue }
      let timeNS = timeLine as NSString
      guard timeRegex.firstMatch(
        in: timeLine,
        options: [],
        range: NSRange(location: 0, length: timeNS.length)
      ) != nil else { continue }
      let startToken = timeLine.split(separator: " ").first.map(String.init) ?? "0:00:00.000"
      let start = parseVTTTimestamp(startToken)
      let text = blockLines
        .drop(while: { !$0.contains("-->") })
        .dropFirst()
        .joined(separator: " ")
        .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { continue }
      lines.append(TimedLine(startSeconds: start, text: text))
    }
    return mergeCaptionLines(lines)
  }

  private static func mergeCaptionLines(_ lines: [TimedLine]) -> [TimedLine] {
    guard !lines.isEmpty else { return [] }
    var merged: [TimedLine] = []
    for line in lines {
      if let last = merged.last,
         abs(last.startSeconds - line.startSeconds) < 0.05,
         last.text == line.text
      {
        continue
      }
      // Collapse very fine-grained auto-captions into ~sentence chunks by time gap.
      if var last = merged.last,
         line.startSeconds - last.startSeconds < 4.5,
         !last.text.hasSuffix("."),
         !last.text.hasSuffix("?"),
         !last.text.hasSuffix("!"),
         last.text.count + line.text.count < 280
      {
        last.text = "\(last.text) \(line.text)"
          .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
          .trimmingCharacters(in: .whitespacesAndNewlines)
        merged[merged.count - 1] = last
      } else {
        merged.append(line)
      }
    }
    return merged
  }

  private static func formatTranscript(
    _ lines: [TimedLine],
    chapters: [Chapter] = []
  ) -> String {
    let sortedChapters = chapters.sorted { $0.startSeconds < $1.startSeconds }
    var chapterIndex = 0
    var lastChapterTitle: String?
    var parts: [String] = []

    for line in lines {
      while chapterIndex < sortedChapters.count,
            sortedChapters[chapterIndex].startSeconds <= line.startSeconds + 0.5
      {
        let chapter = sortedChapters[chapterIndex]
        if chapter.title != lastChapterTitle {
          parts.append("### \(chapter.title)")
          lastChapterTitle = chapter.title
        }
        chapterIndex += 1
      }
      parts.append("\(formatTimestamp(line.startSeconds)) \(line.text)")
    }

    return parts.joined(separator: "\n\n")
  }

  private static func formatTimestamp(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    if h > 0 {
      return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
  }

  private static func parseVTTTimestamp(_ value: String) -> Double {
    let parts = value.split(separator: ":").map(String.init)
    if parts.count == 3,
       let h = Double(parts[0]),
       let m = Double(parts[1]),
       let s = Double(parts[2])
    {
      return h * 3600 + m * 60 + s
    }
    if parts.count == 2,
       let m = Double(parts[0]),
       let s = Double(parts[1])
    {
      return m * 60 + s
    }
    return 0
  }

  // MARK: - Parsing helpers

  private static func extractJSONObject(named name: String, from html: String) -> [String: Any]? {
    let markers = [
      "var \(name) = ",
      "window[\"\(name)\"] = ",
      "\(name) = ",
    ]
    guard let startRange = markers.compactMap({ html.range(of: $0) }).first else {
      return nil
    }
    let fromBrace = html[startRange.upperBound...]
    guard let braceStart = fromBrace.firstIndex(of: "{") else { return nil }

    var depth = 0
    var inString = false
    var escaped = false
    var endIndex: String.Index?

    for index in fromBrace[braceStart...].indices {
      let ch = fromBrace[index]
      if inString {
        if escaped {
          escaped = false
        } else if ch == "\\" {
          escaped = true
        } else if ch == "\"" {
          inString = false
        }
        continue
      }
      if ch == "\"" {
        inString = true
        continue
      }
      if ch == "{" {
        depth += 1
      } else if ch == "}" {
        depth -= 1
        if depth == 0 {
          endIndex = index
          break
        }
      }
    }

    guard let endIndex else { return nil }
    let jsonText = String(fromBrace[braceStart...endIndex])
    guard let data = jsonText.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    return object
  }

  private static func attributeValue(_ name: String, in attrs: String) -> String? {
    let pattern = #"\#(name)\s*=\s*"([^"]*)""#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(
            in: attrs,
            options: [],
            range: NSRange(location: 0, length: (attrs as NSString).length)
          ),
          match.numberOfRanges >= 2
    else {
      return nil
    }
    return (attrs as NSString).substring(with: match.range(at: 1))
  }

  private static func stripHTML(_ value: String) -> String {
    value.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
  }

  private static func decodeXMLEntities(_ value: String) -> String {
    var text = value
    let entities: [(String, String)] = [
      ("&amp;", "&"),
      ("&lt;", "<"),
      ("&gt;", ">"),
      ("&quot;", "\""),
      ("&#39;", "'"),
      ("&apos;", "'"),
      ("\n", "\n"),
    ]
    for (entity, replacement) in entities {
      text = text.replacingOccurrences(of: entity, with: replacement)
    }
    // Numeric entities &#NN;
    if let regex = try? NSRegularExpression(pattern: #"&#(\d+);"#) {
      let ns = text as NSString
      let matches = regex.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length))
      for match in matches.reversed() {
        guard match.numberOfRanges >= 2 else { continue }
        let numString = ns.substring(with: match.range(at: 1))
        if let num = Int(numString), let scalar = UnicodeScalar(num) {
          text = (text as NSString).replacingCharacters(in: match.range, with: String(Character(scalar)))
        }
      }
    }
    return text
  }

  private static func sanitizeVideoId(_ value: String?) -> String? {
    guard let value else { return nil }
    let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleaned.range(of: #"^[\w-]{6,20}$"#, options: .regularExpression) != nil else {
      return nil
    }
    return cleaned
  }

  private static func cleanTitle(_ title: String) -> String {
    var value = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let suffixes = [" - YouTube", " | YouTube", " – YouTube"]
    for suffix in suffixes where value.hasSuffix(suffix) {
      value = String(value.dropLast(suffix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return value
  }
}
