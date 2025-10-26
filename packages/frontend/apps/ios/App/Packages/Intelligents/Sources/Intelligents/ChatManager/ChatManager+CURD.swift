//
//  ChatManager+CURD.swift
//  Intelligents
//
//  Created by 秋星桥 on 7/14/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import EventSource
import Foundation
import MarkdownParser
import MarkdownView

extension ChatManager {
  func clearCurrentSession() {
    guard let session = IntelligentContext.shared.currentSession else {
      print("[-] no current session to clear")
      return
    }

    let mutation = CleanupCopilotSessionMutation(input: .init(
      docId: session.docId ?? "",
      sessionIds: [session.id],
      workspaceId: session.workspaceId
    ))

    QLService.shared.client.perform(mutation: mutation) { result in
      print("[+] cleanup session result: \(result)")
    }
  }
}
