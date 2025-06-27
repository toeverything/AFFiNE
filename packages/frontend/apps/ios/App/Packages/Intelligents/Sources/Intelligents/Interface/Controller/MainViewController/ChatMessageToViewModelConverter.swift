//
//  ChatMessageToViewModelConverter.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation

class ChatMessageToViewModelConverter {
  static func convert(_ message: ChatMessage) -> ChatCellViewModel {
    switch message.role {
    case .user:
      UserMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date(),
        attachments: message.attachments?.compactMap { attachmentId in
          // TODO: 根据 attachmentId 获取实际的 AttachmentViewModel
          AttachmentViewModel(
            id: attachmentId,
            url: "file://\(attachmentId)",
            fileName: "Attachment"
          )
        }
      )

    case .assistant:
      AssistantMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date()
      )

    case .system:
      SystemMessageCellViewModel(
        id: message.messageId,
        content: message.content,
        timestamp: Date()
      )

    case .error:
      ErrorCellViewModel(
        id: message.messageId,
        errorMessage: message.content,
        canRetry: true
      )
    }
  }

  static func convertAll(_ messages: [ChatMessage]) -> [ChatCellViewModel] {
    messages.map { convert($0) }
  }
}
