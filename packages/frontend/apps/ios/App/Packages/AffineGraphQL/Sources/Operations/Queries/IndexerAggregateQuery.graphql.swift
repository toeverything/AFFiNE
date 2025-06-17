// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class IndexerAggregateQuery: GraphQLQuery {
  public static let operationName: String = "indexerAggregate"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query indexerAggregate($id: String!, $input: AggregateInput!) { workspace(id: $id) { __typename aggregate(input: $input) { __typename buckets { __typename key count hits { __typename nodes { __typename fields highlights } } } pagination { __typename count hasMore nextCursor } } } }"#
    ))

  public var id: String
  public var input: AggregateInput

  public init(
    id: String,
    input: AggregateInput
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
        .field("aggregate", Aggregate.self, arguments: ["input": .variable("input")]),
      ] }

      /// Search a specific table with aggregate
      public var aggregate: Aggregate { __data["aggregate"] }

      /// Workspace.Aggregate
      ///
      /// Parent Type: `AggregateResultObjectType`
      public struct Aggregate: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AggregateResultObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("buckets", [Bucket].self),
          .field("pagination", Pagination.self),
        ] }

        public var buckets: [Bucket] { __data["buckets"] }
        public var pagination: Pagination { __data["pagination"] }

        /// Workspace.Aggregate.Bucket
        ///
        /// Parent Type: `AggregateBucketObjectType`
        public struct Bucket: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AggregateBucketObjectType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("key", String.self),
            .field("count", Int.self),
            .field("hits", Hits.self),
          ] }

          public var key: String { __data["key"] }
          public var count: Int { __data["count"] }
          /// The hits object
          public var hits: Hits { __data["hits"] }

          /// Workspace.Aggregate.Bucket.Hits
          ///
          /// Parent Type: `AggregateBucketHitsObjectType`
          public struct Hits: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AggregateBucketHitsObjectType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("nodes", [Node].self),
            ] }

            public var nodes: [Node] { __data["nodes"] }

            /// Workspace.Aggregate.Bucket.Hits.Node
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
          }
        }

        /// Workspace.Aggregate.Pagination
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
