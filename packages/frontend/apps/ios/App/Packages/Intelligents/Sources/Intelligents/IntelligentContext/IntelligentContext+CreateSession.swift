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

    let mutation = CreateCopilotSessionMutation(options: input)

    QLService.shared.client.perform(mutation: mutation) { result in
      switch result {
      case let .success(graphQLResult):
        guard let sessionId = graphQLResult.data?.createCopilotSession else {
          completion(.failure(IntelligentError.sessionCreationFailed("No session ID returned.")))
          return
        }

        let session = ChatSessionObject(
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
        completion(.success(session))

      case let .failure(error):
        completion(.failure(IntelligentError.sessionCreationFailed(error.localizedDescription)))
      }
    }
  }
}
