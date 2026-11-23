//
//  IntelligentContext+CreateSession.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import Foundation

public extension IntelligentContext {
  func createSession(
    workspaceId: String,
    promptName: PromptName = .chatWithAffineAI,
    docId: String? = nil,
    pinned: Bool = false,
    completion: @escaping (Result<ChatSessionObject, Error>) -> Void
  ) {
    let input = CreateChatSessionInput(
      docId: docId.map { .some($0) } ?? .null,
      pinned: .some(pinned),
      promptName: promptName.rawValue,
      workspaceId: workspaceId
    )

    let mutation = CreateCopilotSessionWithHistoryMutation(options: input)

    QLService.shared.client.perform(mutation: mutation) { result in
      switch result {
      case let .success(graphQLResult):
        guard let history = graphQLResult.data?.createCopilotSessionWithHistory else {
          completion(.failure(IntelligentError.sessionCreationFailed("No session ID returned.")))
          return
        }

        let session = ChatSessionObject(
          id: history.sessionId,
          workspaceId: history.workspaceId,
          docId: history.docId,
          promptName: history.promptName,
          model: nil,
          pinned: history.pinned,
          tokens: 0,
          createdAt: history.createdAt,
          updatedAt: history.updatedAt,
          parentSessionId: history.parentSessionId
        )
        completion(.success(session))

      case let .failure(error):
        completion(.failure(IntelligentError.sessionCreationFailed(error.localizedDescription)))
      }
    }
  }
}
