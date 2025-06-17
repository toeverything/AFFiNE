// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class IndexerSearchQuery: GraphQLQuery {
  public static let operationName: String = "indexerSearch"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query indexerSearch($id: String!, $input: SearchInput!) { workspace(id: $id) { __typename search(input: $input) { __typename nodes { __typename fields highlights } pagination { __typename count hasMore nextCursor } } } }"#
    ))

  public var id: String
  public var input: SearchInput

  public init(
    id: String,
    input: SearchInput
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
        .field("search", Search.self, arguments: ["input": .variable("input")]),
      ] }

      /// Search a specific table
      public var search: Search { __data["search"] }

      /// Workspace.Search
      ///
      /// Parent Type: `SearchResultObjectType`
      public struct Search: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SearchResultObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("nodes", [Node].self),
          .field("pagination", Pagination.self),
        ] }

        public var nodes: [Node] { __data["nodes"] }
        public var pagination: Pagination { __data["pagination"] }

        /// Workspace.Search.Node
        ///
        /// Parent Type: `SearchNodeObjectType`
        public struct Node: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SearchNodeObjectType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("fields", AffineGraphQL.JSONObject.self),
            .field("highlights", AffineGraphQL.JSONObject?.self),
          ] }

          /// The search result fields, see UnionSearchItemObjectType
          public var fields: AffineGraphQL.JSONObject { __data["fields"] }
          /// The search result fields, see UnionSearchItemObjectType
          public var highlights: AffineGraphQL.JSONObject? { __data["highlights"] }
        }

        /// Workspace.Search.Pagination
        ///
        /// Parent Type: `SearchResultPagination`
        public struct Pagination: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SearchResultPagination }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("count", Int.self),
            .field("hasMore", Bool.self),
            .field("nextCursor", String?.self),
          ] }

          public var count: Int { __data["count"] }
          public var hasMore: Bool { __data["hasMore"] }
          public var nextCursor: String? { __data["nextCursor"] }
        }
      }
    }
  }
}
