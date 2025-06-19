// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotSessionQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotSession($workspaceId: String!, $sessionId: String!) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename session(sessionId: $sessionId) { __typename id parentSessionId docId pinned promptName model optionalModels } } } }"#
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
          .field("session", Session.self, arguments: ["sessionId": .variable("sessionId")]),
        ] }

        /// Get the session by id
        public var session: Session { __data["session"] }

        /// CurrentUser.Copilot.Session
        ///
        /// Parent Type: `CopilotSessionType`
        public struct Session: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotSessionType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("id", AffineGraphQL.ID.self),
            .field("parentSessionId", AffineGraphQL.ID?.self),
            .field("docId", String?.self),
            .field("pinned", Bool.self),
            .field("promptName", String.self),
            .field("model", String.self),
            .field("optionalModels", [String].self),
          ] }

          public var id: AffineGraphQL.ID { __data["id"] }
          public var parentSessionId: AffineGraphQL.ID? { __data["parentSessionId"] }
          public var docId: String? { __data["docId"] }
          public var pinned: Bool { __data["pinned"] }
          public var promptName: String { __data["promptName"] }
          public var model: String { __data["model"] }
          public var optionalModels: [String] { __data["optionalModels"] }
        }
      }
    }
  }
}
