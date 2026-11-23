// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetDocLastAccessedMembersQuery: GraphQLQuery {
  public static let operationName: String = "getDocLastAccessedMembers"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getDocLastAccessedMembers($workspaceId: String!, $docId: String!, $pagination: PaginationInput!, $query: String, $includeTotal: Boolean) { workspace(id: $workspaceId) { __typename doc(docId: $docId) { __typename lastAccessedMembers( pagination: $pagination query: $query includeTotal: $includeTotal ) { __typename totalCount pageInfo { __typename hasNextPage hasPreviousPage startCursor endCursor } edges { __typename cursor node { __typename user { __typename id name avatarUrl } lastAccessedAt lastDocId } } } } } }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var pagination: PaginationInput
  public var query: GraphQLNullable<String>
  public var includeTotal: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    docId: String,
    pagination: PaginationInput,
    query: GraphQLNullable<String>,
    includeTotal: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.pagination = pagination
    self.query = query
    self.includeTotal = includeTotal
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
    "pagination": pagination,
    "query": query,
    "includeTotal": includeTotal
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetDocLastAccessedMembersQuery.Data.self
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
        .field("doc", Doc.self, arguments: ["docId": .variable("docId")]),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetDocLastAccessedMembersQuery.Data.Workspace.self
      ] }

      /// Get get with given id
      public var doc: Doc { __data["doc"] }

      /// Workspace.Doc
      ///
      /// Parent Type: `DocType`
      public struct Doc: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("lastAccessedMembers", LastAccessedMembers.self, arguments: [
            "pagination": .variable("pagination"),
            "query": .variable("query"),
            "includeTotal": .variable("includeTotal")
          ]),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetDocLastAccessedMembersQuery.Data.Workspace.Doc.self
        ] }

        /// Paginated last accessed members of the current doc
        public var lastAccessedMembers: LastAccessedMembers { __data["lastAccessedMembers"] }

        /// Workspace.Doc.LastAccessedMembers
        ///
        /// Parent Type: `PaginatedDocMemberLastAccess`
        public struct LastAccessedMembers: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedDocMemberLastAccess }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("totalCount", Int?.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            GetDocLastAccessedMembersQuery.Data.Workspace.Doc.LastAccessedMembers.self
          ] }

          public var totalCount: Int? { __data["totalCount"] }
          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// Workspace.Doc.LastAccessedMembers.PageInfo
          ///
          /// Parent Type: `PageInfo`
          public struct PageInfo: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PageInfo }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("hasNextPage", Bool.self),
              .field("hasPreviousPage", Bool.self),
              .field("startCursor", String?.self),
              .field("endCursor", String?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetDocLastAccessedMembersQuery.Data.Workspace.Doc.LastAccessedMembers.PageInfo.self
            ] }

            public var hasNextPage: Bool { __data["hasNextPage"] }
            public var hasPreviousPage: Bool { __data["hasPreviousPage"] }
            public var startCursor: String? { __data["startCursor"] }
            public var endCursor: String? { __data["endCursor"] }
          }

          /// Workspace.Doc.LastAccessedMembers.Edge
          ///
          /// Parent Type: `DocMemberLastAccessEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocMemberLastAccessEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("cursor", String.self),
              .field("node", Node.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetDocLastAccessedMembersQuery.Data.Workspace.Doc.LastAccessedMembers.Edge.self
            ] }

            public var cursor: String { __data["cursor"] }
            public var node: Node { __data["node"] }

            /// Workspace.Doc.LastAccessedMembers.Edge.Node
            ///
            /// Parent Type: `DocMemberLastAccess`
            public struct Node: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocMemberLastAccess }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("user", User.self),
                .field("lastAccessedAt", AffineGraphQL.DateTime.self),
                .field("lastDocId", String?.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                GetDocLastAccessedMembersQuery.Data.Workspace.Doc.LastAccessedMembers.Edge.Node.self
              ] }

              public var user: User { __data["user"] }
              public var lastAccessedAt: AffineGraphQL.DateTime { __data["lastAccessedAt"] }
              public var lastDocId: String? { __data["lastDocId"] }

              /// Workspace.Doc.LastAccessedMembers.Edge.Node.User
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
                public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                  GetDocLastAccessedMembersQuery.Data.Workspace.Doc.LastAccessedMembers.Edge.Node.User.self
                ] }

                public var id: String { __data["id"] }
                public var name: String { __data["name"] }
                public var avatarUrl: String? { __data["avatarUrl"] }
              }
            }
          }
        }
      }
    }
  }
}
