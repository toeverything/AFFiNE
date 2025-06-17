// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceEmbeddingIgnoredDocsQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceEmbeddingIgnoredDocs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceEmbeddingIgnoredDocs($workspaceId: String!, $pagination: PaginationInput!) { workspace(id: $workspaceId) { __typename embedding { __typename ignoredDocs(pagination: $pagination) { __typename totalCount pageInfo { __typename endCursor hasNextPage } edges { __typename node { __typename docId createdAt docCreatedAt docUpdatedAt title createdBy createdByAvatar updatedBy } } } } } }"#
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
          .field("ignoredDocs", IgnoredDocs.self, arguments: ["pagination": .variable("pagination")]),
        ] }

        public var ignoredDocs: IgnoredDocs { __data["ignoredDocs"] }

        /// Workspace.Embedding.IgnoredDocs
        ///
        /// Parent Type: `PaginatedIgnoredDocsType`
        public struct IgnoredDocs: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedIgnoredDocsType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("totalCount", Int.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }

          public var totalCount: Int { __data["totalCount"] }
          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// Workspace.Embedding.IgnoredDocs.PageInfo
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

          /// Workspace.Embedding.IgnoredDocs.Edge
          ///
          /// Parent Type: `CopilotWorkspaceIgnoredDocTypeEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceIgnoredDocTypeEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("node", Node.self),
            ] }

            public var node: Node { __data["node"] }

            /// Workspace.Embedding.IgnoredDocs.Edge.Node
            ///
            /// Parent Type: `CopilotWorkspaceIgnoredDoc`
            public struct Node: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceIgnoredDoc }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("docId", String.self),
                .field("createdAt", AffineGraphQL.DateTime.self),
                .field("docCreatedAt", AffineGraphQL.DateTime?.self),
                .field("docUpdatedAt", AffineGraphQL.DateTime?.self),
                .field("title", String?.self),
                .field("createdBy", String?.self),
                .field("createdByAvatar", String?.self),
                .field("updatedBy", String?.self),
              ] }

              public var docId: String { __data["docId"] }
              public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
              public var docCreatedAt: AffineGraphQL.DateTime? { __data["docCreatedAt"] }
              public var docUpdatedAt: AffineGraphQL.DateTime? { __data["docUpdatedAt"] }
              public var title: String? { __data["title"] }
              public var createdBy: String? { __data["createdBy"] }
              public var createdByAvatar: String? { __data["createdByAvatar"] }
              public var updatedBy: String? { __data["updatedBy"] }
            }
          }
        }
      }
    }
  }
}
