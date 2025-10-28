// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotHistoriesQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotHistories"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotHistories($workspaceId: String!, $pagination: PaginationInput!, $docId: String, $options: QueryChatHistoriesInput) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename chats(pagination: $pagination, docId: $docId, options: $options) { __typename ...PaginatedCopilotChats } } } }"#,
      fragments: [CopilotChatHistory.self, CopilotChatMessage.self, PaginatedCopilotChats.self]
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
