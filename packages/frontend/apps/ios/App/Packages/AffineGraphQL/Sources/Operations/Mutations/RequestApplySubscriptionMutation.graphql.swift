// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RequestApplySubscriptionMutation: GraphQLMutation {
  public static let operationName: String = "requestApplySubscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation requestApplySubscription($transactionId: String!) { requestApplySubscription(transactionId: $transactionId) { __typename id status plan recurring start end nextBillAt canceledAt variant } }"#
    ))

  public var transactionId: String

  public init(transactionId: String) {
    self.transactionId = transactionId
  }

  public var __variables: Variables? { ["transactionId": transactionId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("requestApplySubscription", [RequestApplySubscription].self, arguments: ["transactionId": .variable("transactionId")]),
    ] }

    /// Request to apply the subscription in advance
    public var requestApplySubscription: [RequestApplySubscription] { __data["requestApplySubscription"] }

    /// RequestApplySubscription
    ///
    /// Parent Type: `SubscriptionType`
    public struct RequestApplySubscription: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SubscriptionType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String?.self),
        .field("status", GraphQLEnum<AffineGraphQL.SubscriptionStatus>.self),
        .field("plan", GraphQLEnum<AffineGraphQL.SubscriptionPlan>.self),
        .field("recurring", GraphQLEnum<AffineGraphQL.SubscriptionRecurring>.self),
        .field("start", AffineGraphQL.DateTime.self),
        .field("end", AffineGraphQL.DateTime?.self),
        .field("nextBillAt", AffineGraphQL.DateTime?.self),
        .field("canceledAt", AffineGraphQL.DateTime?.self),
        .field("variant", GraphQLEnum<AffineGraphQL.SubscriptionVariant>?.self),
      ] }

      @available(*, deprecated, message: "removed")
      public var id: String? { __data["id"] }
      public var status: GraphQLEnum<AffineGraphQL.SubscriptionStatus> { __data["status"] }
      /// The 'Free' plan just exists to be a placeholder and for the type convenience of frontend.
      /// There won't actually be a subscription with plan 'Free'
      public var plan: GraphQLEnum<AffineGraphQL.SubscriptionPlan> { __data["plan"] }
      public var recurring: GraphQLEnum<AffineGraphQL.SubscriptionRecurring> { __data["recurring"] }
      public var start: AffineGraphQL.DateTime { __data["start"] }
      public var end: AffineGraphQL.DateTime? { __data["end"] }
      public var nextBillAt: AffineGraphQL.DateTime? { __data["nextBillAt"] }
      public var canceledAt: AffineGraphQL.DateTime? { __data["canceledAt"] }
      public var variant: GraphQLEnum<AffineGraphQL.SubscriptionVariant>? { __data["variant"] }
    }
  }
}
