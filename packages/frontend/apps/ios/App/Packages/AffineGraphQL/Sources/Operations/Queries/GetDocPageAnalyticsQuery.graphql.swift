// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetDocPageAnalyticsQuery: GraphQLQuery {
  public static let operationName: String = "getDocPageAnalytics"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getDocPageAnalytics($workspaceId: String!, $docId: String!, $input: DocPageAnalyticsInput) { workspace(id: $workspaceId) { __typename doc(docId: $docId) { __typename analytics(input: $input) { __typename window { __typename from to timezone bucket requestedSize effectiveSize } series { __typename date totalViews uniqueViews guestViews } summary { __typename totalViews uniqueViews guestViews lastAccessedAt } generatedAt } } } }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var input: GraphQLNullable<DocPageAnalyticsInput>

  public init(
    workspaceId: String,
    docId: String,
    input: GraphQLNullable<DocPageAnalyticsInput>
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.input = input
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
    "input": input
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetDocPageAnalyticsQuery.Data.self
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
        GetDocPageAnalyticsQuery.Data.Workspace.self
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
          .field("analytics", Analytics.self, arguments: ["input": .variable("input")]),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetDocPageAnalyticsQuery.Data.Workspace.Doc.self
        ] }

        /// Doc page analytics in a time window
        public var analytics: Analytics { __data["analytics"] }

        /// Workspace.Doc.Analytics
        ///
        /// Parent Type: `DocPageAnalytics`
        public struct Analytics: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocPageAnalytics }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("window", Window.self),
            .field("series", [Series].self),
            .field("summary", Summary.self),
            .field("generatedAt", AffineGraphQL.DateTime.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            GetDocPageAnalyticsQuery.Data.Workspace.Doc.Analytics.self
          ] }

          public var window: Window { __data["window"] }
          public var series: [Series] { __data["series"] }
          public var summary: Summary { __data["summary"] }
          public var generatedAt: AffineGraphQL.DateTime { __data["generatedAt"] }

          /// Workspace.Doc.Analytics.Window
          ///
          /// Parent Type: `TimeWindow`
          public struct Window: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TimeWindow }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("from", AffineGraphQL.DateTime.self),
              .field("to", AffineGraphQL.DateTime.self),
              .field("timezone", String.self),
              .field("bucket", GraphQLEnum<AffineGraphQL.TimeBucket>.self),
              .field("requestedSize", Int.self),
              .field("effectiveSize", Int.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetDocPageAnalyticsQuery.Data.Workspace.Doc.Analytics.Window.self
            ] }

            public var from: AffineGraphQL.DateTime { __data["from"] }
            public var to: AffineGraphQL.DateTime { __data["to"] }
            public var timezone: String { __data["timezone"] }
            public var bucket: GraphQLEnum<AffineGraphQL.TimeBucket> { __data["bucket"] }
            public var requestedSize: Int { __data["requestedSize"] }
            public var effectiveSize: Int { __data["effectiveSize"] }
          }

          /// Workspace.Doc.Analytics.Series
          ///
          /// Parent Type: `DocPageAnalyticsPoint`
          public struct Series: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocPageAnalyticsPoint }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("date", AffineGraphQL.DateTime.self),
              .field("totalViews", AffineGraphQL.SafeInt.self),
              .field("uniqueViews", AffineGraphQL.SafeInt.self),
              .field("guestViews", AffineGraphQL.SafeInt.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetDocPageAnalyticsQuery.Data.Workspace.Doc.Analytics.Series.self
            ] }

            public var date: AffineGraphQL.DateTime { __data["date"] }
            public var totalViews: AffineGraphQL.SafeInt { __data["totalViews"] }
            public var uniqueViews: AffineGraphQL.SafeInt { __data["uniqueViews"] }
            public var guestViews: AffineGraphQL.SafeInt { __data["guestViews"] }
          }

          /// Workspace.Doc.Analytics.Summary
          ///
          /// Parent Type: `DocPageAnalyticsSummary`
          public struct Summary: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocPageAnalyticsSummary }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("totalViews", AffineGraphQL.SafeInt.self),
              .field("uniqueViews", AffineGraphQL.SafeInt.self),
              .field("guestViews", AffineGraphQL.SafeInt.self),
              .field("lastAccessedAt", AffineGraphQL.DateTime?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetDocPageAnalyticsQuery.Data.Workspace.Doc.Analytics.Summary.self
            ] }

            public var totalViews: AffineGraphQL.SafeInt { __data["totalViews"] }
            public var uniqueViews: AffineGraphQL.SafeInt { __data["uniqueViews"] }
            public var guestViews: AffineGraphQL.SafeInt { __data["guestViews"] }
            public var lastAccessedAt: AffineGraphQL.DateTime? { __data["lastAccessedAt"] }
          }
        }
      }
    }
  }
}
