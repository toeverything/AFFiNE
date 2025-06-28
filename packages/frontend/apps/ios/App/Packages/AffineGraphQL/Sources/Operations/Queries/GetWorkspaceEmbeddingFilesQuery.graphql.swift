// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceEmbeddingFilesQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceEmbeddingFiles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceEmbeddingFiles($workspaceId: String!, $pagination: PaginationInput!) { workspace(id: $workspaceId) { __typename embedding { __typename files(pagination: $pagination) { __typename totalCount pageInfo { __typename endCursor hasNextPage } edges { __typename node { __typename fileId fileName blobId mimeType size createdAt } } } } } }"#
    ))

  public var workspaceId: String
  public var pagination: PaginationInput

  public init(
    workspaceId: String,
    pagination: PaginationInput
  ) {
    self.workspaceId = workspaceId
    self.pagination = pagination
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "pagination": pagination
  ] }

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
          .field("files", Files.self, arguments: ["pagination": .variable("pagination")]),
        ] }

        public var files: Files { __data["files"] }

        /// Workspace.Embedding.Files
        ///
        /// Parent Type: `PaginatedCopilotWorkspaceFileType`
        public struct Files: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCopilotWorkspaceFileType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("totalCount", Int.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }

          public var totalCount: Int { __data["totalCount"] }
          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// Workspace.Embedding.Files.PageInfo
          ///
          /// Parent Type: `PageInfo`
          public struct PageInfo: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PageInfo }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("endCursor", String?.self),
              .field("hasNextPage", Bool.self),
            ] }

            public var endCursor: String? { __data["endCursor"] }
            public var hasNextPage: Bool { __data["hasNextPage"] }
          }

          /// Workspace.Embedding.Files.Edge
          ///
          /// Parent Type: `CopilotWorkspaceFileTypeEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceFileTypeEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("node", Node.self),
            ] }

            public var node: Node { __data["node"] }

            /// Workspace.Embedding.Files.Edge.Node
            ///
            /// Parent Type: `CopilotWorkspaceFile`
            public struct Node: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceFile }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("fileId", String.self),
                .field("fileName", String.self),
                .field("blobId", String.self),
                .field("mimeType", String.self),
                .field("size", AffineGraphQL.SafeInt.self),
                .field("createdAt", AffineGraphQL.DateTime.self),
              ] }

              public var fileId: String { __data["fileId"] }
              public var fileName: String { __data["fileName"] }
              public var blobId: String { __data["blobId"] }
              public var mimeType: String { __data["mimeType"] }
              public var size: AffineGraphQL.SafeInt { __data["size"] }
              public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
            }
          }
        }
      }
    }
  }
}
