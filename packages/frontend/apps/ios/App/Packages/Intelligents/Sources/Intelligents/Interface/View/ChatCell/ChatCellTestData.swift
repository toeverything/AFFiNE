//
//  ChatCellTestData.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/27/25.
//

import Foundation

#if DEBUG
  class ChatCellTestData {
    static func createTestViewModels() -> [ChatCellViewModel] {
      [
        // User message
        UserMessageCellViewModel(
          id: "user-1",
          content: "Hello, AFFiNE AI! Please help me summarize the content of this document.",
          timestamp: Date().addingTimeInterval(-300),
          attachments: [
            AttachmentViewModel(
              id: "attachment-1",
              url: "file://document.pdf",
              mimeType: "application/pdf",
              fileName: "Important Document.pdf",
              size: 1_024_000
            ),
          ]
        ),

        // System message
        SystemMessageCellViewModel(
          id: "system-1",
          content: "Analyzing document content...",
          timestamp: Date().addingTimeInterval(-290)
        ),

        // Loading status
        LoadingCellViewModel(
          id: "loading-1",
          message: "AI is processing your request, please wait...",
          progress: 0.6
        ),

//        // Context reference
//        ContextReferenceCellViewModel(
//          id: "context-1",
//          references: [
//            ChatManager.ContextReference(
//              docId: "doc-1",
//              title: "Project Plan Document",
//              type: "document",
//              chunk: 1,
//              content: "This is the core objectives and timeline of the project, including detailed milestone planning...",
//              distance: 0.1
//            ),
//          ],
//          parentMessageId: "user-1"
//        ),

        // AI assistant reply
        AssistantMessageCellViewModel(
          id: "assistant-1",
          content: "Based on the document you provided, I have summarized the following key content:\\n\\n1. **Project Goals**: This is an important project about product development\\n2. **Timeline**: The project is planned to be completed within 6 months\\n3. **Key Milestones**: Including four main phases: design, development, testing, and deployment\\n\\nThe document also mentions budget allocation and team responsibility assignment. Would you like me to explain any specific part in detail?",
          timestamp: Date().addingTimeInterval(-60),
          model: "GPT-4",
          tokens: 234,
          citations: [
            CitationViewModel(
              id: "citation-1",
              title: "Project Plan Document - Page 3",
              url: "file://document.pdf#page=3",
              snippet: "The project is planned to be completed within 6 months, including four main phases: design, development, testing, and deployment"
            ),
          ]
        ),

        // Workflow status
        WorkflowStatusCellViewModel(
          id: "workflow-1",
          workflow: ChatManager.WorkflowEventData(
            status: "completed",
            type: "document_analysis",
            title: "Document Analysis Completed",
            content: "Successfully analyzed document content and extracted key information",
            progress: 1.0,
            timestamp: Date().addingTimeInterval(-30)
          ),
          parentMessageId: "assistant-1"
        ),

        // Error message
        ErrorCellViewModel(
          id: "error-1",
          errorMessage: "Network connection failed, unable to get latest information. Please check your network connection and try again.",
          canRetry: true,
          retryAction: "retry_network_request"
        ),
      ]
    }

    static func createTestMessages() -> [ChatMessage] {
      [
        ChatMessage(
          id: "msg-1",
          role: .user,
          content: "Hello, AFFiNE AI!",
          attachments: ["file1.pdf"]
        ),
        ChatMessage(
          id: "msg-2",
          role: .assistant,
          content: "Hello! I'm AFFiNE AI, glad to serve you. How can I help you?"
        ),
        ChatMessage(
          id: "msg-3",
          role: .system,
          content: "System message: Current session has been established"
        ),
        ChatMessage(
          id: "msg-4",
          role: .error,
          content: "Connection timeout, please retry"
        ),
      ]
    }
  }
#endif
