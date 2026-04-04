import AffineGraphQL
import CryptoKit
import Foundation

struct CopilotAttachmentUpload {
  let data: Data
  let mimeType: String
  let originalName: String
}

extension QLService {
  func createCopilotMessage(
    workspaceId: String,
    sessionId: String,
    content: String,
    params: AffineGraphQL.JSON,
    attachments: [CopilotAttachmentUpload]
  ) async throws -> String {
    if attachments.isEmpty {
      return try await createCopilotMessage(
        input: CreateChatMessageInput(
          attachments: .none,
          blob: .none,
          blobs: .none,
          content: .some(content),
          params: .some(params),
          sessionId: sessionId
        )
      )
    }

    let attachmentURLs = try await uploadCopilotAttachments(
      workspaceId: workspaceId,
      attachments: attachments
    )
    return try await createCopilotMessage(
      input: CreateChatMessageInput(
        attachments: .some(attachmentURLs),
        blob: .none,
        blobs: .none,
        content: .some(content),
        params: .some(params),
        sessionId: sessionId
      )
    )
  }

  private func createCopilotMessage(
    input: CreateChatMessageInput
  ) async throws -> String {
    let mutation = CreateCopilotMessageMutation(options: input)
    let data = try await perform(mutation: mutation)
    return data.createCopilotMessage
  }

  private func uploadCopilotAttachments(
    workspaceId: String,
    attachments: [CopilotAttachmentUpload]
  ) async throws -> [String] {
    var uploadedURLs = [String]()
    uploadedURLs.reserveCapacity(attachments.count)

    for attachment in attachments {
      let uploadedURL = try await uploadCopilotAttachment(
        workspaceId: workspaceId,
        attachment: attachment
      )
      uploadedURLs.append(uploadedURL)
    }

    return uploadedURLs
  }

  private func uploadCopilotAttachment(
    workspaceId: String,
    attachment: CopilotAttachmentUpload
  ) async throws -> String {
    let blobKey = blobKey(for: attachment)
    let mutation = CreateBlobUploadMutation(
      workspaceId: workspaceId,
      key: blobKey,
      size: attachment.data.count,
      mime: attachment.mimeType
    )
    let uploadData = try await perform(mutation: mutation)
    let upload = uploadData.createBlobUpload

    if upload.alreadyUploaded == true {
      return try await resolveSignedBlobURL(workspaceId: workspaceId, blobKey: blobKey)
    }

    switch upload.method {
    case .case(.graphql):
      throw NSError(
        domain: "QLService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Direct upload is not available"]
      )
    case .case(.presigned):
      guard let uploadURL = upload.uploadUrl else {
        throw NSError(
          domain: "QLService",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Missing presigned upload URL"]
        )
      }
      try await put(
        urlString: uploadURL,
        headers: stringHeaders(from: upload.headers),
        data: attachment.data,
        contentType: attachment.mimeType
      )
      _ = try await perform(mutation: CompleteBlobUploadMutation(
        workspaceId: workspaceId,
        key: blobKey,
        uploadId: .none,
        parts: .none
      ))
    case .case(.multipart):
      guard let uploadId = upload.uploadId, let partSize = upload.partSize else {
        throw NSError(
          domain: "QLService",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Missing multipart upload metadata"]
        )
      }
      let parts = try await uploadMultipartAttachment(
        workspaceId: workspaceId,
        blobKey: blobKey,
        uploadId: uploadId,
        partSize: partSize,
        data: attachment.data,
        uploadedParts: upload.uploadedParts ?? []
      )
      _ = try await perform(mutation: CompleteBlobUploadMutation(
        workspaceId: workspaceId,
        key: blobKey,
        uploadId: .some(uploadId),
        parts: .some(parts)
      ))
    case .unknown(_):
      throw NSError(
        domain: "QLService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Unknown blob upload method"]
      )
    }

    return try await resolveSignedBlobURL(workspaceId: workspaceId, blobKey: blobKey)
  }

  private func uploadMultipartAttachment(
    workspaceId: String,
    blobKey: String,
    uploadId: String,
    partSize: Int,
    data: Data,
    uploadedParts: [CreateBlobUploadMutation.Data.CreateBlobUpload.UploadedPart]
  ) async throws -> [BlobUploadPartInput] {
    var partsMap = Dictionary(uniqueKeysWithValues: uploadedParts.map {
      ($0.partNumber, $0.etag)
    })
    let totalParts = Int(ceil(Double(data.count) / Double(partSize)))

    for partNumber in 1...totalParts {
      if partsMap[partNumber] != nil {
        continue
      }

      let start = (partNumber - 1) * partSize
      let end = min(start + partSize, data.count)
      let chunk = data.subdata(in: start..<end)
      let part = try await fetch(query: GetBlobUploadPartUrlQuery(
        workspaceId: workspaceId,
        key: blobKey,
        uploadId: uploadId,
        partNumber: partNumber
      )).workspace.blobUploadPartUrl
      let response = try await put(
        urlString: part.uploadUrl,
        headers: stringHeaders(from: part.headers),
        data: chunk,
        contentType: nil
      )
      guard let etag = response.value(forHTTPHeaderField: "ETag") else {
        throw NSError(
          domain: "QLService",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Multipart upload response missing ETag"]
        )
      }
      partsMap[partNumber] = etag
    }

    return partsMap
      .sorted { $0.key < $1.key }
      .map { BlobUploadPartInput(etag: $0.value, partNumber: $0.key) }
  }

  private func resolveSignedBlobURL(
    workspaceId: String,
    blobKey: String
  ) async throws -> String {
    var components = URLComponents(
      url: serverBaseURL
        .appendingPathComponent("api")
        .appendingPathComponent("workspaces")
        .appendingPathComponent(workspaceId)
        .appendingPathComponent("blobs")
        .appendingPathComponent(blobKey),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
      URLQueryItem(name: "redirect", value: "manual"),
    ]
    guard let url = components?.url else {
      throw NSError(
        domain: "QLService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid blob redirect URL"]
      )
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    let (data, response) = try await sendAuthenticatedRequest(request)
    guard (200..<300).contains(response.statusCode) else {
      throw NSError(
        domain: "QLService",
        code: response.statusCode,
        userInfo: [NSLocalizedDescriptionKey: "Blob redirect request failed"]
      )
    }
    guard
      let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let signedURL = payload["url"] as? String
    else {
      throw NSError(
        domain: "QLService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Missing signed blob URL"]
      )
    }
    return signedURL
  }

  @discardableResult
  private func put(
    urlString: String,
    headers: [String: String]?,
    data: Data,
    contentType: String?
  ) async throws -> HTTPURLResponse {
    guard let url = URL(string: urlString, relativeTo: serverBaseURL) else {
      throw NSError(
        domain: "QLService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid upload URL"]
      )
    }

    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.httpBody = data
    request.setValue(String(data.count), forHTTPHeaderField: "Content-Length")
    if let contentType {
      request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    }
    headers?.forEach { key, value in
      request.setValue(value, forHTTPHeaderField: key)
    }

    let (_, response) = try await sendAuthenticatedRequest(request)
    guard (200..<300).contains(response.statusCode) else {
      throw NSError(
        domain: "QLService",
        code: response.statusCode,
        userInfo: [NSLocalizedDescriptionKey: "Upload request failed"]
      )
    }
    return response
  }

  private func stringHeaders(
    from headers: AffineGraphQL.JSONObject?
  ) -> [String: String]? {
    guard let object = headers?.object else {
      return nil
    }
    var result = [String: String]()
    for (key, value) in object {
      if let value = value as? String {
        result[key] = value
      }
    }
    return result.isEmpty ? nil : result
  }

  private func blobKey(for attachment: CopilotAttachmentUpload) -> String {
    let digest = SHA256.hash(data: attachment.data)
    let encoded = Data(digest).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    let sanitizedName = attachment.originalName
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: " ", with: "_")
    return "\(encoded)-\(sanitizedName)"
  }
}
