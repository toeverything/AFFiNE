// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminDashboardQuery: GraphQLQuery {
  public static let operationName: String = "adminDashboard"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminDashboard($input: AdminDashboardInput) { adminDashboard(input: $input) { __typename syncActiveUsers syncActiveUsersTimeline { __typename minute activeUsers } syncWindow { __typename from to timezone bucket requestedSize effectiveSize } copilotConversations workspaceStorageBytes blobStorageBytes workspaceStorageHistory { __typename date value } blobStorageHistory { __typename date value } storageWindow { __typename from to timezone bucket requestedSize effectiveSize } topSharedLinks { __typename workspaceId docId title shareUrl publishedAt views uniqueViews guestViews lastAccessedAt } topSharedLinksWindow { __typename from to timezone bucket requestedSize effectiveSize } generatedAt } }"#
    ))

  public var input: GraphQLNullable<AdminDashboardInput>

  public init(input: GraphQLNullable<AdminDashboardInput>) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("adminDashboard", AdminDashboard.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      AdminDashboardQuery.Data.self
    ] }

    /// Get aggregated dashboard metrics for admin panel
    public var adminDashboard: AdminDashboard { __data["adminDashboard"] }

    /// AdminDashboard
    ///
    /// Parent Type: `AdminDashboard`
    public struct AdminDashboard: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminDashboard }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("syncActiveUsers", Int.self),
        .field("syncActiveUsersTimeline", [SyncActiveUsersTimeline].self),
        .field("syncWindow", SyncWindow.self),
        .field("copilotConversations", AffineGraphQL.SafeInt.self),
        .field("workspaceStorageBytes", AffineGraphQL.SafeInt.self),
        .field("blobStorageBytes", AffineGraphQL.SafeInt.self),
        .field("workspaceStorageHistory", [WorkspaceStorageHistory].self),
        .field("blobStorageHistory", [BlobStorageHistory].self),
        .field("storageWindow", StorageWindow.self),
        .field("topSharedLinks", [TopSharedLink].self),
        .field("topSharedLinksWindow", TopSharedLinksWindow.self),
        .field("generatedAt", AffineGraphQL.DateTime.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        AdminDashboardQuery.Data.AdminDashboard.self
      ] }

      public var syncActiveUsers: Int { __data["syncActiveUsers"] }
      public var syncActiveUsersTimeline: [SyncActiveUsersTimeline] { __data["syncActiveUsersTimeline"] }
      public var syncWindow: SyncWindow { __data["syncWindow"] }
      public var copilotConversations: AffineGraphQL.SafeInt { __data["copilotConversations"] }
      public var workspaceStorageBytes: AffineGraphQL.SafeInt { __data["workspaceStorageBytes"] }
      public var blobStorageBytes: AffineGraphQL.SafeInt { __data["blobStorageBytes"] }
      public var workspaceStorageHistory: [WorkspaceStorageHistory] { __data["workspaceStorageHistory"] }
      public var blobStorageHistory: [BlobStorageHistory] { __data["blobStorageHistory"] }
      public var storageWindow: StorageWindow { __data["storageWindow"] }
      public var topSharedLinks: [TopSharedLink] { __data["topSharedLinks"] }
      public var topSharedLinksWindow: TopSharedLinksWindow { __data["topSharedLinksWindow"] }
      public var generatedAt: AffineGraphQL.DateTime { __data["generatedAt"] }

      /// AdminDashboard.SyncActiveUsersTimeline
      ///
      /// Parent Type: `AdminDashboardMinutePoint`
      public struct SyncActiveUsersTimeline: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminDashboardMinutePoint }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("minute", AffineGraphQL.DateTime.self),
          .field("activeUsers", Int.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminDashboardQuery.Data.AdminDashboard.SyncActiveUsersTimeline.self
        ] }

        public var minute: AffineGraphQL.DateTime { __data["minute"] }
        public var activeUsers: Int { __data["activeUsers"] }
      }

      /// AdminDashboard.SyncWindow
      ///
      /// Parent Type: `TimeWindow`
      public struct SyncWindow: AffineGraphQL.SelectionSet {
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
          AdminDashboardQuery.Data.AdminDashboard.SyncWindow.self
        ] }

        public var from: AffineGraphQL.DateTime { __data["from"] }
        public var to: AffineGraphQL.DateTime { __data["to"] }
        public var timezone: String { __data["timezone"] }
        public var bucket: GraphQLEnum<AffineGraphQL.TimeBucket> { __data["bucket"] }
        public var requestedSize: Int { __data["requestedSize"] }
        public var effectiveSize: Int { __data["effectiveSize"] }
      }

      /// AdminDashboard.WorkspaceStorageHistory
      ///
      /// Parent Type: `AdminDashboardValueDayPoint`
      public struct WorkspaceStorageHistory: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminDashboardValueDayPoint }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("date", AffineGraphQL.DateTime.self),
          .field("value", AffineGraphQL.SafeInt.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminDashboardQuery.Data.AdminDashboard.WorkspaceStorageHistory.self
        ] }

        public var date: AffineGraphQL.DateTime { __data["date"] }
        public var value: AffineGraphQL.SafeInt { __data["value"] }
      }

      /// AdminDashboard.BlobStorageHistory
      ///
      /// Parent Type: `AdminDashboardValueDayPoint`
      public struct BlobStorageHistory: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminDashboardValueDayPoint }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("date", AffineGraphQL.DateTime.self),
          .field("value", AffineGraphQL.SafeInt.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminDashboardQuery.Data.AdminDashboard.BlobStorageHistory.self
        ] }

        public var date: AffineGraphQL.DateTime { __data["date"] }
        public var value: AffineGraphQL.SafeInt { __data["value"] }
      }

      /// AdminDashboard.StorageWindow
      ///
      /// Parent Type: `TimeWindow`
      public struct StorageWindow: AffineGraphQL.SelectionSet {
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
          AdminDashboardQuery.Data.AdminDashboard.StorageWindow.self
        ] }

        public var from: AffineGraphQL.DateTime { __data["from"] }
        public var to: AffineGraphQL.DateTime { __data["to"] }
        public var timezone: String { __data["timezone"] }
        public var bucket: GraphQLEnum<AffineGraphQL.TimeBucket> { __data["bucket"] }
        public var requestedSize: Int { __data["requestedSize"] }
        public var effectiveSize: Int { __data["effectiveSize"] }
      }

      /// AdminDashboard.TopSharedLink
      ///
      /// Parent Type: `AdminSharedLinkTopItem`
      public struct TopSharedLink: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminSharedLinkTopItem }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("workspaceId", String.self),
          .field("docId", String.self),
          .field("title", String?.self),
          .field("shareUrl", String.self),
          .field("publishedAt", AffineGraphQL.DateTime?.self),
          .field("views", AffineGraphQL.SafeInt.self),
          .field("uniqueViews", AffineGraphQL.SafeInt.self),
          .field("guestViews", AffineGraphQL.SafeInt.self),
          .field("lastAccessedAt", AffineGraphQL.DateTime?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminDashboardQuery.Data.AdminDashboard.TopSharedLink.self
        ] }

        public var workspaceId: String { __data["workspaceId"] }
        public var docId: String { __data["docId"] }
        public var title: String? { __data["title"] }
        public var shareUrl: String { __data["shareUrl"] }
        public var publishedAt: AffineGraphQL.DateTime? { __data["publishedAt"] }
        public var views: AffineGraphQL.SafeInt { __data["views"] }
        public var uniqueViews: AffineGraphQL.SafeInt { __data["uniqueViews"] }
        public var guestViews: AffineGraphQL.SafeInt { __data["guestViews"] }
        public var lastAccessedAt: AffineGraphQL.DateTime? { __data["lastAccessedAt"] }
      }

      /// AdminDashboard.TopSharedLinksWindow
      ///
      /// Parent Type: `TimeWindow`
      public struct TopSharedLinksWindow: AffineGraphQL.SelectionSet {
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
          AdminDashboardQuery.Data.AdminDashboard.TopSharedLinksWindow.self
        ] }

        public var from: AffineGraphQL.DateTime { __data["from"] }
        public var to: AffineGraphQL.DateTime { __data["to"] }
        public var timezone: String { __data["timezone"] }
        public var bucket: GraphQLEnum<AffineGraphQL.TimeBucket> { __data["bucket"] }
        public var requestedSize: Int { __data["requestedSize"] }
        public var effectiveSize: Int { __data["effectiveSize"] }
      }
    }
  }
}
