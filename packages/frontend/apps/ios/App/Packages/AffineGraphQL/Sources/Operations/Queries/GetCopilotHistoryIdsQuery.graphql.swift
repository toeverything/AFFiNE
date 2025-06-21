// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotHistoryIdsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotHistoryIds"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotHistoryIds($workspaceId: String!, $docId: String, $options: QueryChatHistoriesInput) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename histories(docId: $docId, options: $options) { __typename sessionId pinned messages { __typename id role createdAt } } } } }"#
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
            .field("messages", [Message].self),
          ] }

          public var sessionId: String { __data["sessionId"] }
          public var pinned: Bool { __data["pinned"] }
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
              .field("createdAt", AffineGraphQL.DateTime.self),
            ] }

            public var id: AffineGraphQL.ID? { __data["id"] }
            public var role: String { __data["role"] }
            public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
          }
        }
      }
    }
  }
}
