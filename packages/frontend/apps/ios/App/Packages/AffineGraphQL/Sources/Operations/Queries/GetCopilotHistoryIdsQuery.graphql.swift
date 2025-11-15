// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotHistoryIdsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotHistoryIds"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotHistoryIds($workspaceId: String!, $pagination: PaginationInput!, $docId: String, $options: QueryChatHistoriesInput) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename chats(pagination: $pagination, docId: $docId, options: $options) { __typename pageInfo { __typename hasNextPage hasPreviousPage startCursor endCursor } edges { __typename cursor node { __typename sessionId pinned messages { __typename id role createdAt } } } } } } }"#
    ))

  public var workspaceId: String
  public var pagination: PaginationInput
  public var docId: GraphQLNullable<String>
  public var options: GraphQLNullable<QueryChatHistoriesInput>

  public init(
    workspaceId: String,
    pagination: PaginationInput,
    docId: GraphQLNullable<String>,
    options: GraphQLNullable<QueryChatHistoriesInput>
  ) {
    self.workspaceId = workspaceId
    self.pagination = pagination
    self.docId = docId
    self.options = options
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "pagination": pagination,
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
          .field("chats", Chats.self, arguments: [
            "pagination": .variable("pagination"),
            "docId": .variable("docId"),
            "options": .variable("options")
          ]),
        ] }

        public var chats: Chats { __data["chats"] }

        /// CurrentUser.Copilot.Chats
        ///
        /// Parent Type: `PaginatedCopilotHistoriesType`
        public struct Chats: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCopilotHistoriesType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }

          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// CurrentUser.Copilot.Chats.PageInfo
          ///
          /// Parent Type: `PageInfo`
          public struct PageInfo: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PageInfo }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("hasNextPage", Bool.self),
              .field("hasPreviousPage", Bool.self),
              .field("startCursor", String?.self),
              .field("endCursor", String?.self),
            ] }

            public var hasNextPage: Bool { __data["hasNextPage"] }
            public var hasPreviousPage: Bool { __data["hasPreviousPage"] }
            public var startCursor: String? { __data["startCursor"] }
            public var endCursor: String? { __data["endCursor"] }
          }

          /// CurrentUser.Copilot.Chats.Edge
          ///
          /// Parent Type: `CopilotHistoriesTypeEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistoriesTypeEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("cursor", String.self),
              .field("node", Node.self),
            ] }

            public var cursor: String { __data["cursor"] }
            public var node: Node { __data["node"] }

            /// CurrentUser.Copilot.Chats.Edge.Node
            ///
            /// Parent Type: `CopilotHistories`
            public struct Node: AffineGraphQL.SelectionSet {
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

              /// CurrentUser.Copilot.Chats.Edge.Node.Message
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
  }
}
