// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceArtifactsQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceArtifacts"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceArtifacts($workspaceId: String!, $pagination: PaginationInput!) { workspace(id: $workspaceId) { __typename embedding { __typename artifacts(pagination: $pagination) { __typename totalCount pageInfo { __typename endCursor hasNextPage } edges { __typename node { __typename artifactId contentHash fileName embeddingStatus mediaType size createdAt } } } } } }"#
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
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetWorkspaceArtifactsQuery.Data.self
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
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetWorkspaceArtifactsQuery.Data.Workspace.self
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
          .field("artifacts", Artifacts.self, arguments: ["pagination": .variable("pagination")]),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetWorkspaceArtifactsQuery.Data.Workspace.Embedding.self
        ] }

        public var artifacts: Artifacts { __data["artifacts"] }

        /// Workspace.Embedding.Artifacts
        ///
        /// Parent Type: `PaginatedCopilotWorkspaceArtifactType`
        public struct Artifacts: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCopilotWorkspaceArtifactType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("totalCount", Int.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            GetWorkspaceArtifactsQuery.Data.Workspace.Embedding.Artifacts.self
          ] }

          public var totalCount: Int { __data["totalCount"] }
          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// Workspace.Embedding.Artifacts.PageInfo
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
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetWorkspaceArtifactsQuery.Data.Workspace.Embedding.Artifacts.PageInfo.self
            ] }

            public var endCursor: String? { __data["endCursor"] }
            public var hasNextPage: Bool { __data["hasNextPage"] }
          }

          /// Workspace.Embedding.Artifacts.Edge
          ///
          /// Parent Type: `CopilotWorkspaceArtifactTypeEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceArtifactTypeEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("node", Node.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetWorkspaceArtifactsQuery.Data.Workspace.Embedding.Artifacts.Edge.self
            ] }

            public var node: Node { __data["node"] }

            /// Workspace.Embedding.Artifacts.Edge.Node
            ///
            /// Parent Type: `CopilotWorkspaceArtifact`
            public struct Node: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceArtifact }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("artifactId", String.self),
                .field("contentHash", String.self),
                .field("fileName", String.self),
                .field("embeddingStatus", String.self),
                .field("mediaType", String.self),
                .field("size", AffineGraphQL.SafeInt.self),
                .field("createdAt", AffineGraphQL.DateTime.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                GetWorkspaceArtifactsQuery.Data.Workspace.Embedding.Artifacts.Edge.Node.self
              ] }

              public var artifactId: String { __data["artifactId"] }
              public var contentHash: String { __data["contentHash"] }
              public var fileName: String { __data["fileName"] }
              public var embeddingStatus: String { __data["embeddingStatus"] }
              public var mediaType: String { __data["mediaType"] }
              public var size: AffineGraphQL.SafeInt { __data["size"] }
              public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
            }
          }
        }
      }
    }
  }
}
