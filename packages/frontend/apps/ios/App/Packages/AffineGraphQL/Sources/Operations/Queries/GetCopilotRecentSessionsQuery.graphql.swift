// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotRecentSessionsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotRecentSessions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotRecentSessions($workspaceId: String!, $limit: Int = 10) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename histories(options: { limit: $limit, sessionOrder: desc }) { __typename sessionId workspaceId docId pinned action tokens createdAt updatedAt } } } }"#
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
          .field("histories", [History].self, arguments: ["options": [
            "limit": .variable("limit"),
            "sessionOrder": "desc"
          ]]),
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
            .field("workspaceId", String.self),
            .field("docId", String?.self),
            .field("pinned", Bool.self),
            .field("action", String?.self),
            .field("tokens", Int.self),
            .field("createdAt", AffineGraphQL.DateTime.self),
            .field("updatedAt", AffineGraphQL.DateTime.self),
          ] }

          public var sessionId: String { __data["sessionId"] }
          public var workspaceId: String { __data["workspaceId"] }
          public var docId: String? { __data["docId"] }
          public var pinned: Bool { __data["pinned"] }
          /// An mark identifying which view to use to display the session
          public var action: String? { __data["action"] }
          /// The number of tokens used in the session
          public var tokens: Int { __data["tokens"] }
          public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
          public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }
        }
      }
    }
  }
}
