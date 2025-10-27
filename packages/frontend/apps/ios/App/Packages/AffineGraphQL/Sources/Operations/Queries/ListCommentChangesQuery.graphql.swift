// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListCommentChangesQuery: GraphQLQuery {
  public static let operationName: String = "listCommentChanges"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listCommentChanges($workspaceId: String!, $docId: String!, $pagination: PaginationInput!) { workspace(id: $workspaceId) { __typename commentChanges(docId: $docId, pagination: $pagination) { __typename totalCount edges { __typename cursor node { __typename action id commentId item } } pageInfo { __typename startCursor endCursor hasNextPage hasPreviousPage } } } }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var pagination: PaginationInput

  public init(
    workspaceId: String,
    docId: String,
    pagination: PaginationInput
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.pagination = pagination
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
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
        .field("commentChanges", CommentChanges.self, arguments: [
          "docId": .variable("docId"),
          "pagination": .variable("pagination")
        ]),
      ] }

      /// Get comment changes of a doc
      public var commentChanges: CommentChanges { __data["commentChanges"] }

      /// Workspace.CommentChanges
      ///
      /// Parent Type: `PaginatedCommentChangeObjectType`
      public struct CommentChanges: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCommentChangeObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("totalCount", Int.self),
          .field("edges", [Edge].self),
          .field("pageInfo", PageInfo.self),
        ] }

        public var totalCount: Int { __data["totalCount"] }
        public var edges: [Edge] { __data["edges"] }
        public var pageInfo: PageInfo { __data["pageInfo"] }

        /// Workspace.CommentChanges.Edge
        ///
        /// Parent Type: `CommentChangeObjectTypeEdge`
        public struct Edge: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CommentChangeObjectTypeEdge }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("cursor", String.self),
            .field("node", Node.self),
          ] }

          public var cursor: String { __data["cursor"] }
          public var node: Node { __data["node"] }

          /// Workspace.CommentChanges.Edge.Node
          ///
          /// Parent Type: `CommentChangeObjectType`
          public struct Node: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CommentChangeObjectType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("action", GraphQLEnum<AffineGraphQL.CommentChangeAction>.self),
              .field("id", AffineGraphQL.ID.self),
              .field("commentId", AffineGraphQL.ID?.self),
              .field("item", AffineGraphQL.JSONObject.self),
            ] }

            /// The action of the comment change
            public var action: GraphQLEnum<AffineGraphQL.CommentChangeAction> { __data["action"] }
            public var id: AffineGraphQL.ID { __data["id"] }
            public var commentId: AffineGraphQL.ID? { __data["commentId"] }
            /// The item of the comment or reply, different types have different fields, see UnionCommentObjectType
            public var item: AffineGraphQL.JSONObject { __data["item"] }
          }
        }

        /// Workspace.CommentChanges.PageInfo
        ///
        /// Parent Type: `PageInfo`
        public struct PageInfo: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PageInfo }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("startCursor", String?.self),
            .field("endCursor", String?.self),
            .field("hasNextPage", Bool.self),
            .field("hasPreviousPage", Bool.self),
          ] }

          public var startCursor: String? { __data["startCursor"] }
          public var endCursor: String? { __data["endCursor"] }
          public var hasNextPage: Bool { __data["hasNextPage"] }
          public var hasPreviousPage: Bool { __data["hasPreviousPage"] }
        }
      }
    }
  }
}
