// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetPageGrantedUsersListQuery: GraphQLQuery {
  public static let operationName: String = "getPageGrantedUsersList"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getPageGrantedUsersList($pagination: PaginationInput!, $docId: String!, $workspaceId: String!) { workspace(id: $workspaceId) { __typename doc(docId: $docId) { __typename grantedUsersList(pagination: $pagination) { __typename totalCount pageInfo { __typename endCursor hasNextPage } edges { __typename node { __typename role user { __typename id name email avatarUrl } } } } } } }"#
    ))

  public var pagination: PaginationInput
  public var docId: String
  public var workspaceId: String

  public init(
    pagination: PaginationInput,
    docId: String,
    workspaceId: String
  ) {
    self.pagination = pagination
    self.docId = docId
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { [
    "pagination": pagination,
    "docId": docId,
    "workspaceId": workspaceId
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
        .field("doc", Doc.self, arguments: ["docId": .variable("docId")]),
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
          .field("grantedUsersList", GrantedUsersList.self, arguments: ["pagination": .variable("pagination")]),
        ] }

        /// paginated doc granted users list
        public var grantedUsersList: GrantedUsersList { __data["grantedUsersList"] }

        /// Workspace.Doc.GrantedUsersList
        ///
        /// Parent Type: `PaginatedGrantedDocUserType`
        public struct GrantedUsersList: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedGrantedDocUserType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("totalCount", Int.self),
            .field("pageInfo", PageInfo.self),
            .field("edges", [Edge].self),
          ] }

          public var totalCount: Int { __data["totalCount"] }
          public var pageInfo: PageInfo { __data["pageInfo"] }
          public var edges: [Edge] { __data["edges"] }

          /// Workspace.Doc.GrantedUsersList.PageInfo
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

          /// Workspace.Doc.GrantedUsersList.Edge
          ///
          /// Parent Type: `GrantedDocUserTypeEdge`
          public struct Edge: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.GrantedDocUserTypeEdge }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("node", Node.self),
            ] }

            public var node: Node { __data["node"] }

            /// Workspace.Doc.GrantedUsersList.Edge.Node
            ///
            /// Parent Type: `GrantedDocUserType`
            public struct Node: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.GrantedDocUserType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("role", GraphQLEnum<AffineGraphQL.DocRole>.self),
                .field("user", User.self),
              ] }

              public var role: GraphQLEnum<AffineGraphQL.DocRole> { __data["role"] }
              public var user: User { __data["user"] }

              /// Workspace.Doc.GrantedUsersList.Edge.Node.User
              ///
              /// Parent Type: `WorkspaceUserType`
              public struct User: AffineGraphQL.SelectionSet {
                public let __data: DataDict
                public init(_dataDict: DataDict) { __data = _dataDict }

                public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceUserType }
                public static var __selections: [ApolloAPI.Selection] { [
                  .field("__typename", String.self),
                  .field("id", String.self),
                  .field("name", String.self),
                  .field("email", String.self),
                  .field("avatarUrl", String?.self),
                ] }

                public var id: String { __data["id"] }
                public var name: String { __data["name"] }
                public var email: String { __data["email"] }
                public var avatarUrl: String? { __data["avatarUrl"] }
              }
            }
          }
        }
      }
    }
  }
}
