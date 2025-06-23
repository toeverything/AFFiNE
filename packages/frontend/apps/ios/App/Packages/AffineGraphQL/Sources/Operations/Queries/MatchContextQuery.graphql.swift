// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class MatchContextQuery: GraphQLQuery {
  public static let operationName: String = "matchContext"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query matchContext($contextId: String, $workspaceId: String, $content: String!, $limit: SafeInt, $scopedThreshold: Float, $threshold: Float) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename contexts(contextId: $contextId) { __typename matchFiles( content: $content limit: $limit scopedThreshold: $scopedThreshold threshold: $threshold ) { __typename fileId blobId name mimeType chunk content distance } matchWorkspaceDocs( content: $content limit: $limit scopedThreshold: $scopedThreshold threshold: $threshold ) { __typename docId chunk content distance } } } } }"#
    ))

  public var contextId: GraphQLNullable<String>
  public var workspaceId: GraphQLNullable<String>
  public var content: String
  public var limit: GraphQLNullable<SafeInt>
  public var scopedThreshold: GraphQLNullable<Double>
  public var threshold: GraphQLNullable<Double>

  public init(
    contextId: GraphQLNullable<String>,
    workspaceId: GraphQLNullable<String>,
    content: String,
    limit: GraphQLNullable<SafeInt>,
    scopedThreshold: GraphQLNullable<Double>,
    threshold: GraphQLNullable<Double>
  ) {
    self.contextId = contextId
    self.workspaceId = workspaceId
    self.content = content
    self.limit = limit
    self.scopedThreshold = scopedThreshold
    self.threshold = threshold
  }

  public var __variables: Variables? { [
    "contextId": contextId,
    "workspaceId": workspaceId,
    "content": content,
    "limit": limit,
    "scopedThreshold": scopedThreshold,
    "threshold": threshold
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
            .field("matchFiles", [MatchFile].self, arguments: [
              "content": .variable("content"),
              "limit": .variable("limit"),
              "scopedThreshold": .variable("scopedThreshold"),
              "threshold": .variable("threshold")
            ]),
            .field("matchWorkspaceDocs", [MatchWorkspaceDoc].self, arguments: [
              "content": .variable("content"),
              "limit": .variable("limit"),
              "scopedThreshold": .variable("scopedThreshold"),
              "threshold": .variable("threshold")
            ]),
          ] }

          /// match file in context
          public var matchFiles: [MatchFile] { __data["matchFiles"] }
          /// match workspace docs
          public var matchWorkspaceDocs: [MatchWorkspaceDoc] { __data["matchWorkspaceDocs"] }

          /// CurrentUser.Copilot.Context.MatchFile
          ///
          /// Parent Type: `ContextMatchedFileChunk`
          public struct MatchFile: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ContextMatchedFileChunk }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("fileId", String.self),
              .field("blobId", String.self),
              .field("name", String.self),
              .field("mimeType", String.self),
              .field("chunk", AffineGraphQL.SafeInt.self),
              .field("content", String.self),
              .field("distance", Double?.self),
            ] }

            public var fileId: String { __data["fileId"] }
            public var blobId: String { __data["blobId"] }
            public var name: String { __data["name"] }
            public var mimeType: String { __data["mimeType"] }
            public var chunk: AffineGraphQL.SafeInt { __data["chunk"] }
            public var content: String { __data["content"] }
            public var distance: Double? { __data["distance"] }
          }

          /// CurrentUser.Copilot.Context.MatchWorkspaceDoc
          ///
          /// Parent Type: `ContextMatchedDocChunk`
          public struct MatchWorkspaceDoc: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ContextMatchedDocChunk }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("docId", String.self),
              .field("chunk", AffineGraphQL.SafeInt.self),
              .field("content", String.self),
              .field("distance", Double?.self),
            ] }

            public var docId: String { __data["docId"] }
            public var chunk: AffineGraphQL.SafeInt { __data["chunk"] }
            public var content: String { __data["content"] }
            public var distance: Double? { __data["distance"] }
          }
        }
      }
    }
  }
}
