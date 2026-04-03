// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCopilotSessionWithHistoryMutation: GraphQLMutation {
  public static let operationName: String = "createCopilotSessionWithHistory"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCopilotSessionWithHistory($options: CreateChatSessionInput!) { createCopilotSessionWithHistory(options: $options) { __typename ...CopilotChatHistory } }"#,
      fragments: [CopilotChatHistory.self]
    ))

  public var options: CreateChatSessionInput

  public init(options: CreateChatSessionInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCopilotSessionWithHistory", CreateCopilotSessionWithHistory.self, arguments: ["options": .variable("options")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateCopilotSessionWithHistoryMutation.Data.self
    ] }

    /// Create a chat session and return full session payload
    public var createCopilotSessionWithHistory: CreateCopilotSessionWithHistory { __data["createCopilotSessionWithHistory"] }

    /// CreateCopilotSessionWithHistory
    ///
    /// Parent Type: `CopilotHistories`
    public struct CreateCopilotSessionWithHistory: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistories }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .fragment(CopilotChatHistory.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        CreateCopilotSessionWithHistoryMutation.Data.CreateCopilotSessionWithHistory.self,
        CopilotChatHistory.self
      ] }

      public var sessionId: String { __data["sessionId"] }
      public var workspaceId: String { __data["workspaceId"] }
      public var docId: String? { __data["docId"] }
      public var parentSessionId: String? { __data["parentSessionId"] }
      public var promptName: String { __data["promptName"] }
      public var model: String { __data["model"] }
      public var optionalModels: [String] { __data["optionalModels"] }
      /// An mark identifying which view to use to display the session
      public var action: String? { __data["action"] }
      public var pinned: Bool { __data["pinned"] }
      public var title: String? { __data["title"] }
      /// The number of tokens used in the session
      public var tokens: Int { __data["tokens"] }
      public var messages: [Message] { __data["messages"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }

      public struct Fragments: FragmentContainer {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public var copilotChatHistory: CopilotChatHistory { _toFragment() }
      }

      public typealias Message = CopilotChatHistory.Message
    }
  }
}
