// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListCommentsQuery: GraphQLQuery {
  public static let operationName: String = "listComments"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listComments($workspaceId: String!, $docId: String!, $pagination: PaginationInput) { workspace(id: $workspaceId) { __typename comments(docId: $docId, pagination: $pagination) { __typename totalCount edges { __typename cursor node { __typename id content resolved createdAt updatedAt user { __typename id name avatarUrl } replies { __typename commentId id content createdAt updatedAt user { __typename id name avatarUrl } } } } pageInfo { __typename startCursor endCursor hasNextPage hasPreviousPage } } } }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var pagination: GraphQLNullable<PaginationInput>

  public init(
    workspaceId: String,
    docId: String,
    pagination: GraphQLNullable<PaginationInput>
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
        .field("comments", Comments.self, arguments: [
          "docId": .variable("docId"),
          "pagination": .variable("pagination")
        ]),
      ] }

      /// Get comments of a doc
      public var comments: Comments { __data["comments"] }

      /// Workspace.Comments
      ///
      /// Parent Type: `PaginatedCommentObjectType`
      public struct Comments: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCommentObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("totalCount", Int.self),
          .field("edges", [Edge].self),
          .field("pageInfo", PageInfo.self),
        ] }

        public var totalCount: Int { __data["totalCount"] }
        public var edges: [Edge] { __data["edges"] }
        public var pageInfo: PageInfo { __data["pageInfo"] }

        /// Workspace.Comments.Edge
        ///
        /// Parent Type: `CommentObjectTypeEdge`
        public struct Edge: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CommentObjectTypeEdge }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("cursor", String.self),
            .field("node", Node.self),
          ] }

          public var cursor: String { __data["cursor"] }
          public var node: Node { __data["node"] }

          /// Workspace.Comments.Edge.Node
          ///
          /// Parent Type: `CommentObjectType`
          public struct Node: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CommentObjectType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("id", AffineGraphQL.ID.self),
              .field("content", AffineGraphQL.JSONObject.self),
              .field("resolved", Bool.self),
              .field("createdAt", AffineGraphQL.DateTime.self),
              .field("updatedAt", AffineGraphQL.DateTime.self),
              .field("user", User.self),
              .field("replies", [Reply].self),
            ] }

            public var id: AffineGraphQL.ID { __data["id"] }
            /// The content of the comment
            public var content: AffineGraphQL.JSONObject { __data["content"] }
            /// Whether the comment is resolved
            public var resolved: Bool { __data["resolved"] }
            /// The created at time of the comment
            public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
            /// The updated at time of the comment
            public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }
            /// The user who created the comment
            public var user: User { __data["user"] }
            /// The replies of the comment
            public var replies: [Reply] { __data["replies"] }

            /// Workspace.Comments.Edge.Node.User
            ///
            /// Parent Type: `PublicUserType`
            public struct User: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PublicUserType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("id", String.self),
                .field("name", String.self),
                .field("avatarUrl", String?.self),
              ] }

              public var id: String { __data["id"] }
              public var name: String { __data["name"] }
              public var avatarUrl: String? { __data["avatarUrl"] }
            }

            /// Workspace.Comments.Edge.Node.Reply
            ///
            /// Parent Type: `ReplyObjectType`
            public struct Reply: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ReplyObjectType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("commentId", AffineGraphQL.ID.self),
                .field("id", AffineGraphQL.ID.self),
                .field("content", AffineGraphQL.JSONObject.self),
                .field("createdAt", AffineGraphQL.DateTime.self),
                .field("updatedAt", AffineGraphQL.DateTime.self),
                .field("user", User.self),
              ] }

              public var commentId: AffineGraphQL.ID { __data["commentId"] }
              public var id: AffineGraphQL.ID { __data["id"] }
              /// The content of the reply
              public var content: AffineGraphQL.JSONObject { __data["content"] }
              /// The created at time of the reply
              public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
              /// The updated at time of the reply
              public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }
              /// The user who created the reply
              public var user: User { __data["user"] }

              /// Workspace.Comments.Edge.Node.Reply.User
              ///
              /// Parent Type: `PublicUserType`
              public struct User: AffineGraphQL.SelectionSet {
                public let __data: DataDict
                public init(_dataDict: DataDict) { __data = _dataDict }

                public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PublicUserType }
                public static var __selections: [ApolloAPI.Selection] { [
                  .field("__typename", String.self),
                  .field("id", String.self),
                  .field("name", String.self),
                  .field("avatarUrl", String?.self),
                ] }

                public var id: String { __data["id"] }
                public var name: String { __data["name"] }
                public var avatarUrl: String? { __data["avatarUrl"] }
              }
            }
          }
        }

        /// Workspace.Comments.PageInfo
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
