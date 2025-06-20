// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListContextQuery: GraphQLQuery {
  public static let operationName: String = "listContext"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listContext($workspaceId: String!, $sessionId: String!) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename contexts(sessionId: $sessionId) { __typename id workspaceId } } } }"#
    ))

  public var workspaceId: String
  public var sessionId: String

  public init(
    workspaceId: String,
    sessionId: String
  ) {
    self.workspaceId = workspaceId
    self.sessionId = sessionId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "sessionId": sessionId
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
          .field("contexts", [Context].self, arguments: ["sessionId": .variable("sessionId")]),
        ] }

        /// Get the context list of a session
        public var contexts: [Context] { __data["contexts"] }

        /// CurrentUser.Copilot.Context
        ///
        /// Parent Type: `CopilotContext`
        public struct Context: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotContext }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("id", AffineGraphQL.ID?.self),
            .field("workspaceId", String.self),
          ] }

          public var id: AffineGraphQL.ID? { __data["id"] }
          public var workspaceId: String { __data["workspaceId"] }
        }
      }
    }
  }
}
