// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspacePageByIdQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspacePageById"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspacePageById($workspaceId: String!, $pageId: String!) { workspace(id: $workspaceId) { __typename doc(docId: $pageId) { __typename id mode defaultRole public title summary } } }"#
    ))

  public var workspaceId: String
  public var pageId: String

  public init(
    workspaceId: String,
    pageId: String
  ) {
    self.workspaceId = workspaceId
    self.pageId = pageId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "pageId": pageId
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
        .field("doc", Doc.self, arguments: ["docId": .variable("pageId")]),
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
          .field("id", String.self),
          .field("mode", GraphQLEnum<AffineGraphQL.PublicDocMode>.self),
          .field("defaultRole", GraphQLEnum<AffineGraphQL.DocRole>.self),
          .field("public", Bool.self),
          .field("title", String?.self),
          .field("summary", String?.self),
        ] }

        public var id: String { __data["id"] }
        public var mode: GraphQLEnum<AffineGraphQL.PublicDocMode> { __data["mode"] }
        public var defaultRole: GraphQLEnum<AffineGraphQL.DocRole> { __data["defaultRole"] }
        public var `public`: Bool { __data["public"] }
        public var title: String? { __data["title"] }
        public var summary: String? { __data["summary"] }
      }
    }
  }
}
