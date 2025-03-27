// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotSessionsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotSessions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotSessions($workspaceId: String!, $docId: String, $options: QueryChatSessionsInput) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename sessions(docId: $docId, options: $options) { __typename id parentSessionId promptName } } } }"#
    ))

  public var workspaceId: String
  public var docId: GraphQLNullable<String>
  public var options: GraphQLNullable<QueryChatSessionsInput>

  public init(
    workspaceId: String,
    docId: GraphQLNullable<String>,
    options: GraphQLNullable<QueryChatSessionsInput>
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
          .field("sessions", [Session].self, arguments: [
            "docId": .variable("docId"),
            "options": .variable("options")
          ]),
        ] }

        /// Get the session list in the workspace
        public var sessions: [Session] { __data["sessions"] }

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
            .field("promptName", String.self),
          ] }

          public var id: AffineGraphQL.ID { __data["id"] }
          public var parentSessionId: AffineGraphQL.ID? { __data["parentSessionId"] }
          public var promptName: String { __data["promptName"] }
        }
      }
    }
  }
}
