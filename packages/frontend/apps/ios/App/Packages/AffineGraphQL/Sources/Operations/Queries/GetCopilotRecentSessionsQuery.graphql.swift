// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotRecentSessionsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotRecentSessions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotRecentSessions($workspaceId: String!, $limit: Int = 10) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename chats( pagination: { first: $limit } options: { fork: false, sessionOrder: desc, withMessages: true } ) { __typename ...PaginatedCopilotChats } } } }"#,
      fragments: [CopilotChatHistory.self, CopilotChatMessage.self, PaginatedCopilotChats.self]
    ))

  public var workspaceId: String
  public var limit: GraphQLNullable<Int>

  public init(
    workspaceId: String,
    limit: GraphQLNullable<Int> = 10
  ) {
    self.workspaceId = workspaceId
    self.limit = limit
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "limit": limit
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
            "pagination": ["first": .variable("limit")],
            "options": [
              "fork": false,
              "sessionOrder": "desc",
              "withMessages": true
            ]
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
            .fragment(PaginatedCopilotChats.self),
          ] }

          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          public struct Fragments: FragmentContainer {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public var paginatedCopilotChats: PaginatedCopilotChats { _toFragment() }
          }

          public typealias PageInfo = PaginatedCopilotChats.PageInfo

          public typealias Edge = PaginatedCopilotChats.Edge
        }
      }
    }
  }
}
