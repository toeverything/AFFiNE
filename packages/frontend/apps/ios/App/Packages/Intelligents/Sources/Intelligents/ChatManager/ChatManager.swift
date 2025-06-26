//
//  ChatManager.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Apollo
import Combine
import Foundation

// MARK: - ChatManager

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
    promptName: String = "",
    docId: String? = nil,
    pinned: Bool = false
  ) async throws -> SessionViewModel {
    isLoading = true
    error = nil

    do {
      let input = CreateChatSessionInput(
        docId: docId.map { .some($0) } ?? .null,
        pinned: .some(pinned),
        promptName: promptName,
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
              promptName: promptName,
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
    attachments: [String] = [],
    sessionId: String? = nil
  ) async throws {
    guard let targetSessionId = sessionId ?? currentSession?.id else {
      throw ChatError.noActiveSession
    }

    isLoading = true
    error = nil

    // Add user message immediately
    let userMessage = ChatMessage(
      id: UUID().uuidString,
      role: .user,
      content: content,
      attachments: attachments.isEmpty ? nil : attachments,
      params: nil,
      createdAt: DateTime(date: Date())
    )

    await MainActor.run {
      var sessionMessages = self.messages[targetSessionId] ?? []
      sessionMessages.append(userMessage)
      self.messages[targetSessionId] = sessionMessages
    }

    do {
      let input = CreateChatMessageInput(
        attachments: attachments.isEmpty ? .null : .some(attachments),
        blobs: .null,
        content: .some(content),
        params: .null,
        sessionId: targetSessionId
      )

      let mutation = CreateCopilotMessageMutation(options: input)

      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        apolloClient.perform(mutation: mutation) { result in
          switch result {
          case let .success(graphQLResult):
            guard let messageId = graphQLResult.data?.createCopilotMessage else {
              continuation.resume(throwing: ChatError.invalidResponse)
              return
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

            Task { @MainActor in
              var sessionMessages = self.messages[targetSessionId] ?? []
              sessionMessages.append(assistantMessage)
              self.messages[targetSessionId] = sessionMessages
              self.isLoading = false
            }

            continuation.resume()

            // TODO: Implement streaming response handling

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
}

// MARK: - ChatError

public enum ChatError: LocalizedError {
  case noActiveSession
  case invalidResponse
  case networkError(Error)

  public var errorDescription: String? {
    switch self {
    case .noActiveSession:
      "No active chat session"
    case .invalidResponse:
      "Invalid response from server"
    case let .networkError(error):
      "Network error: \(error.localizedDescription)"
    }
  }
}
