// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotHistoriesQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotHistories"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotHistories($workspaceId: String!, $docId: String, $options: QueryChatHistoriesInput) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename histories(docId: $docId, options: $options) { __typename sessionId pinned tokens action createdAt messages { __typename id role content streamObjects { __typename type textDelta toolCallId toolName args result } attachments createdAt } } } } }"#
    ))

  public var workspaceId: String
  public var docId: GraphQLNullable<String>
  public var options: GraphQLNullable<QueryChatHistoriesInput>

  public init(
    workspaceId: String,
    docId: GraphQLNullable<String>,
    options: GraphQLNullable<QueryChatHistoriesInput>
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.options = options
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
    "options": options
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("currentUser", CurrentUser?.self),
    ] }

    /// Get current user
    public var currentUser: CurrentUser? { __data["currentUser"] }

    /// CurrentUser
    ///
    /// Parent Type: `UserType`
    public struct CurrentUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("copilot", Copilot.self, arguments: ["workspaceId": .variable("workspaceId")]),
      ] }

      public var copilot: Copilot { __data["copilot"] }

      /// CurrentUser.Copilot
      ///
      /// Parent Type: `Copilot`
      public struct Copilot: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Copilot }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("histories", [History].self, arguments: [
            "docId": .variable("docId"),
            "options": .variable("options")
          ]),
        ] }

        public var histories: [History] { __data["histories"] }

        /// CurrentUser.Copilot.History
        ///
        /// Parent Type: `CopilotHistories`
        public struct History: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistories }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("sessionId", String.self),
            .field("pinned", Bool.self),
            .field("tokens", Int.self),
            .field("action", String?.self),
            .field("createdAt", AffineGraphQL.DateTime.self),
            .field("messages", [Message].self),
          ] }

          public var sessionId: String { __data["sessionId"] }
          public var pinned: Bool { __data["pinned"] }
          /// The number of tokens used in the session
          public var tokens: Int { __data["tokens"] }
          /// An mark identifying which view to use to display the session
          public var action: String? { __data["action"] }
          public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
          public var messages: [Message] { __data["messages"] }

          /// CurrentUser.Copilot.History.Message
          ///
          /// Parent Type: `ChatMessage`
          public struct Message: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ChatMessage }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("id", AffineGraphQL.ID?.self),
              .field("role", String.self),
              .field("content", String.self),
              .field("streamObjects", [StreamObject]?.self),
              .field("attachments", [String]?.self),
              .field("createdAt", AffineGraphQL.DateTime.self),
            ] }

            public var id: AffineGraphQL.ID? { __data["id"] }
            public var role: String { __data["role"] }
            public var content: String { __data["content"] }
            public var streamObjects: [StreamObject]? { __data["streamObjects"] }
            public var attachments: [String]? { __data["attachments"] }
            public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }

            /// CurrentUser.Copilot.History.Message.StreamObject
            ///
            /// Parent Type: `StreamObject`
            public struct StreamObject: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.StreamObject }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("type", String.self),
                .field("textDelta", String?.self),
                .field("toolCallId", String?.self),
                .field("toolName", String?.self),
                .field("args", AffineGraphQL.JSON?.self),
                .field("result", AffineGraphQL.JSON?.self),
              ] }

              public var type: String { __data["type"] }
              public var textDelta: String? { __data["textDelta"] }
              public var toolCallId: String? { __data["toolCallId"] }
              public var toolName: String? { __data["toolName"] }
              public var args: AffineGraphQL.JSON? { __data["args"] }
              public var result: AffineGraphQL.JSON? { __data["result"] }
            }
          }
        }
      }
    }
  }
}
