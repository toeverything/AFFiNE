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

  @Published public private(set) var sessions: [SessionViewModel] = []
  @Published public private(set) var currentSession: SessionViewModel?
  @Published public private(set) var messages: [String: [ChatMessage]] = [:]
  @Published public private(set) var isLoading = false
  @Published public private(set) var error: Error?

  private var cancellables = Set<AnyCancellable>()
  private let apolloClient: ApolloClient

  // MARK: - Initialization

  private init(apolloClient: ApolloClient = QLService.shared.client) {
    self.apolloClient = apolloClient
  }

  // MARK: - Public Methods

  public func createSession(
    workspaceId: String,
    promptName: PromptName = .chatWithAffineAI,
    docId: String? = nil,
    pinned: Bool = false
  ) async throws -> SessionViewModel {
    isLoading = true
    error = nil

    do {
      let input = CreateChatSessionInput(
        docId: docId.map { .some($0) } ?? .null,
        pinned: .some(pinned),
        promptName: promptName.rawValue,
        workspaceId: workspaceId
      )

      let mutation = CreateCopilotSessionMutation(options: input)

      return try await withCheckedThrowingContinuation { continuation in
        apolloClient.perform(mutation: mutation) { result in
          switch result {
          case let .success(graphQLResult):
            guard let sessionId = graphQLResult.data?.createCopilotSession else {
              continuation.resume(throwing: ChatError.invalidResponse)
              return
            }

            let session = SessionViewModel(
              id: sessionId,
              workspaceId: workspaceId,
              docId: docId,
              promptName: promptName.rawValue,
              model: nil,
              pinned: pinned,
              tokens: 0,
              createdAt: DateTime(date: Date()),
              updatedAt: DateTime(date: Date()),
              parentSessionId: nil
            )

            Task { @MainActor in
              self.sessions.append(session)
              self.currentSession = session
              self.messages[sessionId] = []
              self.isLoading = false
            }

            continuation.resume(returning: session)

          case let .failure(error):
            Task { @MainActor in
              self.error = error
              self.isLoading = false
            }
            continuation.resume(throwing: error)
          }
        }
      }
    } catch {
      await MainActor.run {
        self.error = error
        self.isLoading = false
      }
      throw error
    }
  }

  public func sendMessage(
    content: String,
    inputBoxData: InputBoxData? = nil,
    sessionId: String? = nil
  ) async throws {
    guard let targetSessionId = sessionId ?? currentSession?.id else {
      throw ChatError.noActiveSession
    }

    isLoading = true
    error = nil

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
      params: params.isEmpty ? nil : params.mapValues { String(describing: $0) },
      createdAt: DateTime(date: Date())
    )

    await MainActor.run {
      var sessionMessages = self.messages[targetSessionId] ?? []
      sessionMessages.append(userMessage)
      self.messages[targetSessionId] = sessionMessages
    }

    do {
      let input = try CreateChatMessageInput(
        attachments: attachmentIds.isEmpty ? .null : .some(attachmentIds),
        content: .some(content),
        params: .some(AffineGraphQL.JSON(_jsonValue: params)),
        sessionId: targetSessionId
      )

      let mutation = CreateCopilotMessageMutation(options: input)

      let messageId = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
        apolloClient.perform(mutation: mutation) { result in
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
        params: nil,
        createdAt: DateTime(date: Date())
      )

      await MainActor.run {
        var sessionMessages = self.messages[targetSessionId] ?? []
        sessionMessages.append(assistantMessage)
        self.messages[targetSessionId] = sessionMessages
        self.isLoading = false
      }

      // Start streaming response
      try await startStreamingResponse(sessionId: targetSessionId, messageId: messageId)

    } catch {
      await MainActor.run {
        self.error = error
        self.isLoading = false
      }
      throw error
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

  public func switchToSession(_ session: SessionViewModel) {
    currentSession = session
  }

  public func deleteSession(sessionId: String) {
    sessions.removeAll { $0.id == sessionId }
    messages.removeValue(forKey: sessionId)

    if currentSession?.id == sessionId {
      currentSession = sessions.first
    }
  }

  public func clearError() {
    error = nil
  }

  // MARK: - Context Management

  public func createContext(sessionId: String, workspaceId: String) async throws -> String {
    let mutation = CreateCopilotContextMutation(workspaceId: workspaceId, sessionId: sessionId)

    return try await withCheckedThrowingContinuation { continuation in
      apolloClient.perform(mutation: mutation) { result in
        switch result {
        case let .success(graphQLResult):
          guard let contextId = graphQLResult.data?.createCopilotContext else {
            continuation.resume(throwing: ChatError.invalidResponse)
            return
          }
          continuation.resume(returning: contextId)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func addFileToContext(contextId _: String, fileData _: Data, fileName _: String) async throws {
    // TODO: Implement file upload and context addition
    // This would involve:
    // 1. Upload the file to get a blob ID
    // 2. Add the blob to context using AddContextFileMutation
    throw ChatError.notImplemented("File upload not implemented yet")
  }

  public func addDocumentToContext(contextId: String, docId: String) async throws {
    let input = AffineGraphQL.AddContextDocInput(contextId: contextId, docId: docId)
    let mutation = AddContextDocMutation(options: input)

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      apolloClient.perform(mutation: mutation) { result in
        switch result {
        case .success:
          continuation.resume()
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func matchContext(contextId: String, content: String, limit: Int = 5) async throws -> [ContextReference] {
    let query = MatchContextQuery(
      contextId: .some(contextId),
      workspaceId: .null,
      content: content,
      limit: .some(limit.string),
      scopedThreshold: .null,
      threshold: .null
    )

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[ContextReference], Error>) in
      apolloClient.fetch(query: query) { result in
        switch result {
        case let .success(graphQLResult):
          guard let contexts = graphQLResult.data?.currentUser?.copilot.contexts else {
            continuation.resume(returning: [])
            return
          }

          var references: [ContextReference] = []

          for context in contexts {
            // Process file matches
            for file in context.matchFiles ?? [] {
              let ref = ContextReference(
                fileId: file.fileId,
                chunk: .init(file.chunk) ?? 0,
                content: file.content,
                distance: file.distance ?? 0
              )
              references.append(ref)
            }

            // Process document matches
            for doc in context.matchWorkspaceDocs ?? [] {
              let ref = ContextReference(
                docId: doc.docId,
                chunk: .init(doc.chunk) ?? 0,
                content: doc.content,
                distance: doc.distance ?? 0
              )
              references.append(ref)
            }
          }

          continuation.resume(returning: references)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  // MARK: - Session Management

  public func updateSession(
    sessionId: String,
    docId: String? = nil,
    pinned: Bool? = nil,
    promptName: String? = nil
  ) async throws {
    var input = AffineGraphQL.UpdateChatSessionInput(sessionId: sessionId)

    if let docId {
      input.docId = .some(docId)
    }
    if let pinned {
      input.pinned = .some(pinned)
    }
    if let promptName {
      input.promptName = .some(promptName)
    }

    let mutation = UpdateCopilotSessionMutation(options: input)

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      apolloClient.perform(mutation: mutation) { result in
        switch result {
        case .success:
          continuation.resume()
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func forkSession(
    sessionId: String,
    workspaceId: String,
    docId: String,
    latestMessageId: String
  ) async throws -> String {
    let input = AffineGraphQL.ForkChatSessionInput(
      docId: docId,
      latestMessageId: .some(latestMessageId),
      sessionId: sessionId,
      workspaceId: workspaceId
    )

    let mutation = ForkCopilotSessionMutation(options: input)

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
      apolloClient.perform(mutation: mutation) { result in
        switch result {
        case let .success(graphQLResult):
          guard let newSessionId = graphQLResult.data?.forkCopilotSession else {
            continuation.resume(throwing: ChatError.invalidResponse)
            return
          }
          continuation.resume(returning: newSessionId)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func loadSessionHistory(sessionId: String, workspaceId: String) async throws -> [ChatMessage] {
    let options = AffineGraphQL.QueryChatHistoriesInput(
      action: .null,
      limit: .null,
      sessionId: .some(sessionId),
      skip: .null
    )

    let query = GetCopilotHistoriesQuery(
      workspaceId: workspaceId,
      docId: .null,
      options: .some(options)
    )

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[ChatMessage], Error>) in
      apolloClient.fetch(query: query) { result in
        switch result {
        case let .success(graphQLResult):
          guard let histories = graphQLResult.data?.currentUser?.copilot.histories,
                let history = histories.first
          else {
            continuation.resume(returning: [])
            return
          }

          let messages = history.messages.compactMap { message -> ChatMessage? in
            guard let role = ChatMessage.MessageRole(rawValue: message.role) else {
              return nil
            }

            return ChatMessage(
              id: message.id?.description,
              role: role,
              content: message.content ?? "",
              attachments: message.attachments,
              params: nil, // GraphQL doesn't return params in history
              createdAt: message.createdAt
            )
          }

          continuation.resume(returning: messages)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func loadRecentSessions(workspaceId: String, limit: Int = 10) async throws -> [SessionViewModel] {
    let query = GetCopilotRecentSessionsQuery(workspaceId: workspaceId, limit: .some(limit))

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[SessionViewModel], Error>) in
      apolloClient.fetch(query: query) { result in
        switch result {
        case let .success(graphQLResult):
          guard let histories = graphQLResult.data?.currentUser?.copilot.histories else {
            continuation.resume(returning: [])
            return
          }

          let sessions = histories.compactMap { history -> SessionViewModel? in
            SessionViewModel(
              id: history.sessionId,
              workspaceId: workspaceId,
              docId: history.docId, // Available in recent sessions query
              promptName: history.action ?? "Chat With AFFiNE AI",
              model: nil,
              pinned: history.pinned,
              tokens: history.tokens,
              createdAt: history.createdAt,
              updatedAt: history.updatedAt,
              parentSessionId: nil
            )
          }

          continuation.resume(returning: sessions)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  // MARK: - File Upload

  public func uploadFile(workspaceId _: String, fileData _: Data, fileName _: String) async throws -> String {
    // TODO: Implement file upload to get blob ID
    // This would use AddWorkspaceEmbeddingFilesMutation
    throw ChatError.notImplemented("File upload not implemented yet")
  }

  // MARK: - Embedding Management

  public func getWorkspaceEmbeddingStatus(workspaceId: String) async throws -> WorkspaceEmbeddingStatus {
    let query = GetWorkspaceEmbeddingStatusQuery(workspaceId: workspaceId)

    return try await withCheckedThrowingContinuation { continuation in
      apolloClient.fetch(query: query) { result in
        switch result {
        case let .success(graphQLResult):
          guard let status = graphQLResult.data?.queryWorkspaceEmbeddingStatus else {
            continuation.resume(throwing: ChatError.invalidResponse)
            return
          }

          let embeddingStatus = WorkspaceEmbeddingStatus(
            workspaceId: workspaceId,
            total: .init(status.total) ?? 0,
            embedded: .init(status.embedded) ?? 0
          )

          continuation.resume(returning: embeddingStatus)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func queueWorkspaceEmbedding(workspaceId: String, docIds: [String]) async throws {
    let mutation = QueueWorkspaceEmbeddingMutation(workspaceId: workspaceId, docId: docIds)

    try await withCheckedThrowingContinuation { continuation in
      apolloClient.perform(mutation: mutation) { result in
        switch result {
        case .success:
          continuation.resume()
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  // MARK: - Retry Message

  public func retryMessage(sessionId: String, messageId: String) async throws {
    // Start streaming response with retry flag
    try await startStreamingResponse(sessionId: sessionId, messageId: messageId, isRetry: true)
  }
}

// MARK: - ChatError

public enum ChatError: LocalizedError {
  case noActiveSession
  case invalidResponse
  case networkError(Error)
  case notImplemented(String)

  public var errorDescription: String? {
    switch self {
    case .noActiveSession:
      "No active chat session"
    case .invalidResponse:
      "Invalid response from server"
    case let .networkError(error):
      "Network error: \(error.localizedDescription)"
    case let .notImplemented(feature):
      "Feature not implemented: \(feature)"
    }
  }
}
