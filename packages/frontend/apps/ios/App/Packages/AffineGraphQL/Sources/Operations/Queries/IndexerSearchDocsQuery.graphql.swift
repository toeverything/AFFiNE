// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class IndexerSearchDocsQuery: GraphQLQuery {
  public static let operationName: String = "indexerSearchDocs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query indexerSearchDocs($id: String!, $input: SearchDocsInput!) { workspace(id: $id) { __typename searchDocs(input: $input) { __typename docId title blockId highlight createdAt updatedAt createdByUser { __typename id name avatarUrl } updatedByUser { __typename id name avatarUrl } } } }"#
    ))

  public var id: String
  public var input: SearchDocsInput

  public init(
    id: String,
    input: SearchDocsInput
  ) {
    self.id = id
    self.input = input
  }

  public var __variables: Variables? { [
    "id": id,
    "input": input
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
        .field("searchDocs", [SearchDoc].self, arguments: ["input": .variable("input")]),
      ] }

      /// Search docs by keyword
      public var searchDocs: [SearchDoc] { __data["searchDocs"] }

      /// Workspace.SearchDoc
      ///
      /// Parent Type: `SearchDocObjectType`
      public struct SearchDoc: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SearchDocObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("docId", String.self),
          .field("title", String.self),
          .field("blockId", String.self),
          .field("highlight", String.self),
          .field("createdAt", AffineGraphQL.DateTime.self),
          .field("updatedAt", AffineGraphQL.DateTime.self),
          .field("createdByUser", CreatedByUser?.self),
          .field("updatedByUser", UpdatedByUser?.self),
        ] }

        public var docId: String { __data["docId"] }
        public var title: String { __data["title"] }
        public var blockId: String { __data["blockId"] }
        public var highlight: String { __data["highlight"] }
        public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
        public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }
        public var createdByUser: CreatedByUser? { __data["createdByUser"] }
        public var updatedByUser: UpdatedByUser? { __data["updatedByUser"] }

        /// Workspace.SearchDoc.CreatedByUser
        ///
        /// Parent Type: `PublicUserType`
        public struct CreatedByUser: AffineGraphQL.SelectionSet {
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

        /// Workspace.SearchDoc.UpdatedByUser
        ///
        /// Parent Type: `PublicUserType`
        public struct UpdatedByUser: AffineGraphQL.SelectionSet {
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
}
