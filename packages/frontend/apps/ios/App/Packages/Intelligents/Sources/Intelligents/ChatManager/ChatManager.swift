//
//  ChatManager.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import Combine
import Foundation

// MARK: - ChatManager

public enum PromptName: String, Codable {
  case summary = "Summary"
  case summaryAsTitle = "Summary as title"
  case explainThis = "Explain this"
  case writeAnArticleAboutThis = "Write an article about this"
  case writeATwitterAboutThis = "Write a twitter about this"
  case writeAPoemAboutThis = "Write a poem about this"
  case writeABlogPostAboutThis = "Write a blog post about this"
  case writeOutline = "Write outline"
  case changeToneTo = "Change tone to"
  case improveWritingForIt = "Improve writing for it"
  case improveGrammarForIt = "Improve grammar for it"
  case fixSpellingForIt = "Fix spelling for it"
  case createHeadings = "Create headings"
  case makeItLonger = "Make it longer"
  case makeItShorter = "Make it shorter"
  case continueWriting = "Continue writing"
  case chatWithAffineAI = "Chat With AFFiNE AI"
  case searchWithAffineAI = "Search With AFFiNE AI"
}

public class ChatManager: ObservableObject {
  public static let shared = ChatManager()

  // MARK: - Properties

  @Published public private(set) var messages: [String: [ChatMessage]] = [:]

  private var cancellables = Set<AnyCancellable>()

  // MARK: - Initialization

  private init() {}

  // MARK: - Public Methods

  public func sendMessage(
    content: String,
    inputBoxData: InputBoxData? = nil,
    sessionId: String
  ) {
    Task {
      await _sendMessage(content: content, inputBoxData: inputBoxData, sessionId: sessionId)
    }
  }

  private func _sendMessage(
    content: String,
    inputBoxData: InputBoxData? = nil,
    sessionId: String
  ) async {
    // Prepare attachments and parameters
    var attachmentIds: [String] = []
    var params: [String: AnyHashable] = [
      "docs": [String](),
      "files": [String](),
      "searchMode": inputBoxData?.isNetworkEnabled == true ? "NETWORK" : "AUTO",
    ]

    // Handle file uploads if we have inputBoxData
    if let inputBoxData {
      // Upload file attachments
      for fileAttachment in inputBoxData.fileAttachments {
        if let data = fileAttachment.data {
          // TODO: Upload file and get blob ID
          // For now, use placeholder
          let blobId = "file_\(fileAttachment.id.uuidString)"
          attachmentIds.append(blobId)
        }
      }

      // Add document attachments to params
      let docIds = inputBoxData.documentAttachments.compactMap { doc in
        doc.documentID.isEmpty ? nil : doc.documentID
      }
      params["docs"] = docIds

      // Add tool settings
      if inputBoxData.isToolEnabled {
        params["tools"] = true
      }
      if inputBoxData.isDeepThinkingEnabled {
        params["deepThinking"] = true
      }
    }

    // Add user message immediately
    let userMessage = ChatMessage(
      id: UUID().uuidString,
      role: .user,
      content: content,
      attachments: attachmentIds.isEmpty ? nil : attachmentIds,
      params: params.isEmpty ? nil : params.mapValues { String(describing: $0) }
    )

    await MainActor.run {
      var sessionMessages = self.messages[sessionId] ?? []
      sessionMessages.append(userMessage)
      self.messages[sessionId] = sessionMessages
    }

    do {
      let input = try CreateChatMessageInput(
        attachments: attachmentIds.isEmpty ? .null : .some(attachmentIds),
        content: .some(content),
        params: .some(AffineGraphQL.JSON(_jsonValue: params)),
        sessionId: sessionId
      )

      let mutation = CreateCopilotMessageMutation(options: input)

      let messageId = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
        QLService.shared.client.perform(mutation: mutation) { result in
          switch result {
          case let .success(graphQLResult):
            guard let messageId = graphQLResult.data?.createCopilotMessage else {
              continuation.resume(throwing: ChatError.invalidResponse)
              return
            }
            continuation.resume(returning: messageId)

          case let .failure(error):
            continuation.resume(throwing: error)
          }
        }
      }

      // Add assistant message placeholder
      let assistantMessage = ChatMessage(
        id: messageId,
        role: .assistant,
        content: "Thinking...",
        attachments: nil,
        params: nil
      )

      await MainActor.run {
        var sessionMessages = self.messages[sessionId] ?? []
        sessionMessages.append(assistantMessage)
        self.messages[sessionId] = sessionMessages
      }

      // Start streaming response
      try await startStreamingResponse(sessionId: sessionId, messageId: messageId)

    } catch {
      // Add error message to chat
      await MainActor.run {
        let errorMessage = ChatMessage(
          id: UUID().uuidString,
          role: .error,
          content: error.localizedDescription,
          attachments: nil,
          params: nil
        )
        var sessionMessages = self.messages[sessionId] ?? []
        sessionMessages.append(errorMessage)
        self.messages[sessionId] = sessionMessages
      }
    }
  }

  // MARK: - Streaming Response

  private func startStreamingResponse(sessionId: String, messageId: String, isRetry _: Bool = false) async throws {
    // TODO: Implement Server-Sent Events for streaming
    // The actual implementation would connect to:
    // GET /api/copilot/chat/{sessionId}/stream?messageId={messageId}&retry={isRetry}

    // For now, simulate streaming with a delay
    try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

    await MainActor.run {
      var sessionMessages = self.messages[sessionId] ?? []
      if let lastIndex = sessionMessages.lastIndex(where: { $0.id == messageId }) {
        let responses = [
          "This is a simulated streaming response. The actual implementation would use Server-Sent Events to connect to the AFFiNE AI backend.",
          "Hello! I'm AFFiNE AI. How can I help you today?",
          "I can help you with writing, analysis, summarization, and more. What would you like to work on?",
          "I notice you've uploaded some files. Would you like me to analyze them for you?",
          "Based on the context provided, here's what I found...",
        ]

        sessionMessages[lastIndex].content = responses.randomElement() ?? "Hello! How can I help you?"
      }
      self.messages[sessionId] = sessionMessages
    }
  }

  public func deleteSessionMessages(sessionId: String) {
    messages.removeValue(forKey: sessionId)
  }

  // MARK: - Retry Message

  public func retryMessage(sessionId: String, messageId: String) async throws {
    // Start streaming response with retry flag
    try await startStreamingResponse(sessionId: sessionId, messageId: messageId, isRetry: true)
  }

  // MARK: - ViewModel Generation

  public func viewModels(for sessionId: String) -> [any ChatCellViewModel] {
    guard let messages = messages[sessionId] else { return [] }

    var viewModels: [any ChatCellViewModel] = []

    for message in messages {
      let mainViewModel = createMainViewModel(from: message)
      viewModels.append(mainViewModel)

      if let attachments = message.attachments, !attachments.isEmpty {
        let attachmentViewModels = attachments.map { attachmentId in
          AttachmentViewModel(
            id: attachmentId,
            url: attachmentId, // TODO: IMPL
            mimeType: nil,
            fileName: "Attachment",
            size: nil
          )
        }

        let attachmentViewModel = AttachmentCellViewModel(
          id: "\(message.messageId)_attachments",
          attachments: attachmentViewModels,
          parentMessageId: message.messageId
        )
        viewModels.append(attachmentViewModel)
      }

      // TODO: OTHER ITEMS
    }

    return viewModels
  }

  private func createMainViewModel(from message: ChatMessage) -> any ChatCellViewModel {
    switch message.role {
    case .user:
      UserMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date(),
        attachments: [], // 应该从消息中获取实际时间戳
        isRetrying: false
      )

    case .assistant:
      AssistantMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date(), // 应该从消息中获取实际时间戳
        isStreaming: message.content == "Thinking...", // 简单判断是否在流式传输
        model: message.params?["model"],
        tokens: Int(message.params?["tokens"] ?? ""),
        canRetry: true
      )

    case .system:
      SystemMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date() // 应该从消息中获取实际时间戳
      )

    case .error:
      ErrorCellViewModel(
        id: message.messageId,
        errorMessage: message.content,
        canRetry: true,
        retryAction: "retry_message"
      )
    }
  }

  // MARK: - Loading State Management

  public func addLoadingMessage(to sessionId: String, message: String? = nil) {
    let loadingMessage = ChatMessage(
      id: "loading_\(UUID().uuidString)",
      role: .system,
      content: message ?? "正在处理...",
      attachments: nil,
      params: ["type": "loading"]
    )

    var sessionMessages = messages[sessionId] ?? []
    sessionMessages.append(loadingMessage)
    messages[sessionId] = sessionMessages
  }

  public func removeLoadingMessage(from sessionId: String) {
    var sessionMessages = messages[sessionId] ?? []
    sessionMessages.removeAll { message in
      message.params?["type"] == "loading"
    }
    messages[sessionId] = sessionMessages
  }
}

// MARK: - ChatError

public enum ChatError: LocalizedError {
  case invalidResponse
  case networkError(Error)
  case notImplemented(String)

  public var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "Invalid response from server"
    case let .networkError(error):
      "Network error: \(error.localizedDescription)"
    case let .notImplemented(feature):
      "Feature not implemented: \(feature)"
    }
  }
}
