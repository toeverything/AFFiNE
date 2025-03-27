// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class MatchContextQuery: GraphQLQuery {
  public static let operationName: String = "matchContext"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query matchContext($contextId: String!, $content: String!, $limit: SafeInt) { currentUser { __typename copilot { __typename contexts(contextId: $contextId) { __typename matchContext(content: $content, limit: $limit) { __typename fileId chunk content distance } } } } }"#
    ))

  public var contextId: String
  public var content: String
  public var limit: GraphQLNullable<SafeInt>

  public init(
    contextId: String,
    content: String,
    limit: GraphQLNullable<SafeInt>
  ) {
    self.contextId = contextId
    self.content = content
    self.limit = limit
  }

  public var __variables: Variables? { [
    "contextId": contextId,
    "content": content,
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
        .field("copilot", Copilot.self),
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
          .field("contexts", [Context].self, arguments: ["contextId": .variable("contextId")]),
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
            .field("matchContext", [MatchContext].self, arguments: [
              "content": .variable("content"),
              "limit": .variable("limit")
            ]),
          ] }

          /// match file context
          public var matchContext: [MatchContext] { __data["matchContext"] }

          /// CurrentUser.Copilot.Context.MatchContext
          ///
          /// Parent Type: `ContextMatchedFileChunk`
          public struct MatchContext: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ContextMatchedFileChunk }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("fileId", String.self),
              .field("chunk", AffineGraphQL.SafeInt.self),
              .field("content", String.self),
              .field("distance", Double?.self),
            ] }

            public var fileId: String { __data["fileId"] }
            public var chunk: AffineGraphQL.SafeInt { __data["chunk"] }
            public var content: String { __data["content"] }
            public var distance: Double? { __data["distance"] }
          }
        }
      }
    }
  }
}
