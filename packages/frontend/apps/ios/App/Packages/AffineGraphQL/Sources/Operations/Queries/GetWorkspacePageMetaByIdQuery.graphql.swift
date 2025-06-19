// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspacePageMetaByIdQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspacePageMetaById"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspacePageMetaById($id: String!, $pageId: String!) { workspace(id: $id) { __typename pageMeta(pageId: $pageId) { __typename createdAt updatedAt createdBy { __typename name avatarUrl } updatedBy { __typename name avatarUrl } } } }"#
    ))

  public var id: String
  public var pageId: String

  public init(
    id: String,
    pageId: String
  ) {
    self.id = id
    self.pageId = pageId
  }

  public var __variables: Variables? { [
    "id": id,
    "pageId": pageId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("id")]),
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
        .field("pageMeta", PageMeta.self, arguments: ["pageId": .variable("pageId")]),
      ] }

      /// Cloud page metadata of workspace
      @available(*, deprecated, message: "use [WorkspaceType.doc] instead")
      public var pageMeta: PageMeta { __data["pageMeta"] }

      /// Workspace.PageMeta
      ///
      /// Parent Type: `WorkspaceDocMeta`
      public struct PageMeta: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceDocMeta }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("createdAt", AffineGraphQL.DateTime.self),
          .field("updatedAt", AffineGraphQL.DateTime.self),
          .field("createdBy", CreatedBy?.self),
          .field("updatedBy", UpdatedBy?.self),
        ] }

        public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
        public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }
        public var createdBy: CreatedBy? { __data["createdBy"] }
        public var updatedBy: UpdatedBy? { __data["updatedBy"] }

        /// Workspace.PageMeta.CreatedBy
        ///
        /// Parent Type: `EditorType`
        public struct CreatedBy: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.EditorType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("name", String.self),
            .field("avatarUrl", String?.self),
          ] }

          public var name: String { __data["name"] }
          public var avatarUrl: String? { __data["avatarUrl"] }
        }

        /// Workspace.PageMeta.UpdatedBy
        ///
        /// Parent Type: `EditorType`
        public struct UpdatedBy: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.EditorType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("name", String.self),
            .field("avatarUrl", String?.self),
          ] }

          public var name: String { __data["name"] }
          public var avatarUrl: String? { __data["avatarUrl"] }
        }
      }
    }
  }
}
