// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminMailDeliveriesQuery: GraphQLQuery {
  public static let operationName: String = "adminMailDeliveries"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminMailDeliveries($input: AdminMailDeliveriesInput) { adminMailDeliveries(input: $input) { __typename window { __typename from to timezone bucket requestedSize effectiveSize } summary { __typename total sent failed skipped canceled queued sending retryWait successRate } byStatus { __typename key label total points { __typename bucket count } } byType { __typename key label total points { __typename bucket count } } byOutcome { __typename key label total points { __typename bucket count } } } }"#
    ))

  public var input: GraphQLNullable<AdminMailDeliveriesInput>

  public init(input: GraphQLNullable<AdminMailDeliveriesInput>) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("adminMailDeliveries", AdminMailDeliveries.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      AdminMailDeliveriesQuery.Data.self
    ] }

    /// Aggregate mail delivery timeline facts for admin panel
    public var adminMailDeliveries: AdminMailDeliveries { __data["adminMailDeliveries"] }

    /// AdminMailDeliveries
    ///
    /// Parent Type: `AdminMailDeliveryAnalytics`
    public struct AdminMailDeliveries: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliveryAnalytics }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("window", Window.self),
        .field("summary", Summary.self),
        .field("byStatus", [ByStatus].self),
        .field("byType", [ByType].self),
        .field("byOutcome", [ByOutcome].self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        AdminMailDeliveriesQuery.Data.AdminMailDeliveries.self
      ] }

      public var window: Window { __data["window"] }
      public var summary: Summary { __data["summary"] }
      public var byStatus: [ByStatus] { __data["byStatus"] }
      public var byType: [ByType] { __data["byType"] }
      public var byOutcome: [ByOutcome] { __data["byOutcome"] }

      /// AdminMailDeliveries.Window
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
          AdminMailDeliveriesQuery.Data.AdminMailDeliveries.Window.self
        ] }

        public var from: AffineGraphQL.DateTime { __data["from"] }
        public var to: AffineGraphQL.DateTime { __data["to"] }
        public var timezone: String { __data["timezone"] }
        public var bucket: GraphQLEnum<AffineGraphQL.TimeBucket> { __data["bucket"] }
        public var requestedSize: Int { __data["requestedSize"] }
        public var effectiveSize: Int { __data["effectiveSize"] }
      }

      /// AdminMailDeliveries.Summary
      ///
      /// Parent Type: `AdminMailDeliverySummary`
      public struct Summary: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliverySummary }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("total", Int.self),
          .field("sent", Int.self),
          .field("failed", Int.self),
          .field("skipped", Int.self),
          .field("canceled", Int.self),
          .field("queued", Int.self),
          .field("sending", Int.self),
          .field("retryWait", Int.self),
          .field("successRate", Double.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminMailDeliveriesQuery.Data.AdminMailDeliveries.Summary.self
        ] }

        public var total: Int { __data["total"] }
        public var sent: Int { __data["sent"] }
        public var failed: Int { __data["failed"] }
        public var skipped: Int { __data["skipped"] }
        public var canceled: Int { __data["canceled"] }
        public var queued: Int { __data["queued"] }
        public var sending: Int { __data["sending"] }
        public var retryWait: Int { __data["retryWait"] }
        public var successRate: Double { __data["successRate"] }
      }

      /// AdminMailDeliveries.ByStatus
      ///
      /// Parent Type: `AdminMailDeliverySeries`
      public struct ByStatus: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliverySeries }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("key", String.self),
          .field("label", String.self),
          .field("total", Int.self),
          .field("points", [Point].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByStatus.self
        ] }

        public var key: String { __data["key"] }
        public var label: String { __data["label"] }
        public var total: Int { __data["total"] }
        public var points: [Point] { __data["points"] }

        /// AdminMailDeliveries.ByStatus.Point
        ///
        /// Parent Type: `AdminMailDeliveryPoint`
        public struct Point: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliveryPoint }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("bucket", AffineGraphQL.DateTime.self),
            .field("count", Int.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByStatus.Point.self
          ] }

          public var bucket: AffineGraphQL.DateTime { __data["bucket"] }
          public var count: Int { __data["count"] }
        }
      }

      /// AdminMailDeliveries.ByType
      ///
      /// Parent Type: `AdminMailDeliverySeries`
      public struct ByType: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliverySeries }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("key", String.self),
          .field("label", String.self),
          .field("total", Int.self),
          .field("points", [Point].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByType.self
        ] }

        public var key: String { __data["key"] }
        public var label: String { __data["label"] }
        public var total: Int { __data["total"] }
        public var points: [Point] { __data["points"] }

        /// AdminMailDeliveries.ByType.Point
        ///
        /// Parent Type: `AdminMailDeliveryPoint`
        public struct Point: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliveryPoint }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("bucket", AffineGraphQL.DateTime.self),
            .field("count", Int.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByType.Point.self
          ] }

          public var bucket: AffineGraphQL.DateTime { __data["bucket"] }
          public var count: Int { __data["count"] }
        }
      }

      /// AdminMailDeliveries.ByOutcome
      ///
      /// Parent Type: `AdminMailDeliverySeries`
      public struct ByOutcome: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliverySeries }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("key", String.self),
          .field("label", String.self),
          .field("total", Int.self),
          .field("points", [Point].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByOutcome.self
        ] }

        public var key: String { __data["key"] }
        public var label: String { __data["label"] }
        public var total: Int { __data["total"] }
        public var points: [Point] { __data["points"] }

        /// AdminMailDeliveries.ByOutcome.Point
        ///
        /// Parent Type: `AdminMailDeliveryPoint`
        public struct Point: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminMailDeliveryPoint }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("bucket", AffineGraphQL.DateTime.self),
            .field("count", Int.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            AdminMailDeliveriesQuery.Data.AdminMailDeliveries.ByOutcome.Point.self
          ] }

          public var bucket: AffineGraphQL.DateTime { __data["bucket"] }
          public var count: Int { __data["count"] }
        }
      }
    }
  }
}
