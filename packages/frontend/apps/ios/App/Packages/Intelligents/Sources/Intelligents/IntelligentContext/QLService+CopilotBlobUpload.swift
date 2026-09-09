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
            sessionId: sessionId,
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
        sessionId: String,
        attachments: [CopilotAttachmentUpload]
    ) async throws -> [String] {
        var uploadedURLs = [String]()
        uploadedURLs.reserveCapacity(attachments.count)

        for attachment in attachments {
            let uploadedURL = try await uploadCopilotAttachment(
                workspaceId: workspaceId,
                sessionId: sessionId,
                attachment: attachment
            )
            uploadedURLs.append(uploadedURL)
        }

        return uploadedURLs
    }

    private func uploadCopilotAttachment(
        workspaceId: String,
        sessionId: String,
        attachment: CopilotAttachmentUpload
    ) async throws -> String {
        let blobKey = blobKey(for: attachment)
        var components = URLComponents(
            url: serverBaseURL
                .appendingPathComponent("api")
                .appendingPathComponent("copilot")
                .appendingPathComponent("chat")
                .appendingPathComponent(sessionId)
                .appendingPathComponent("attachments")
                .appendingPathComponent(blobKey),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "workspaceId", value: workspaceId),
            URLQueryItem(name: "mimeType", value: attachment.mimeType),
            URLQueryItem(name: "fileName", value: attachment.originalName),
        ]
        guard let url = components?.url else {
            throw NSError(
                domain: "QLService",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid Copilot attachment URL"]
            )
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = attachment.data
        request.setValue(String(attachment.data.count), forHTTPHeaderField: "Content-Length")
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await sendAuthenticatedRequest(request)
        guard (200 ..< 300).contains(response.statusCode) else {
            throw NSError(
                domain: "QLService",
                code: response.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "Copilot attachment upload failed"]
            )
        }
        guard
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let attachmentURL = payload["url"] as? String
        else {
            throw NSError(
                domain: "QLService",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Missing Copilot attachment URL"]
            )
        }
        return attachmentURL
    }

    private func blobKey(for attachment: CopilotAttachmentUpload) -> String {
        let digest = SHA256.hash(data: attachment.data)
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
