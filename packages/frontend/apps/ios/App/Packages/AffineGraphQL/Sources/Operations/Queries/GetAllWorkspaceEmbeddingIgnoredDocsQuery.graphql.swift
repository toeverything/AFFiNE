// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetAllWorkspaceEmbeddingIgnoredDocsQuery: GraphQLQuery {
  public static let operationName: String = "getAllWorkspaceEmbeddingIgnoredDocs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getAllWorkspaceEmbeddingIgnoredDocs($workspaceId: String!) { workspace(id: $workspaceId) { __typename embedding { __typename allIgnoredDocs { __typename docId createdAt } } } }"#
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("embedding", Embedding.self),
      ] }

      public var embedding: Embedding { __data["embedding"] }

      /// Workspace.Embedding
      ///
      /// Parent Type: `CopilotWorkspaceConfig`
      public struct Embedding: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceConfig }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("allIgnoredDocs", [AllIgnoredDoc].self),
        ] }

        public var allIgnoredDocs: [AllIgnoredDoc] { __data["allIgnoredDocs"] }

        /// Workspace.Embedding.AllIgnoredDoc
        ///
        /// Parent Type: `CopilotWorkspaceIgnoredDoc`
        public struct AllIgnoredDoc: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceIgnoredDoc }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("docId", String.self),
            .field("createdAt", AffineGraphQL.DateTime.self),
          ] }

          public var docId: String { __data["docId"] }
          public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
        }
      }
    }
  }
}
