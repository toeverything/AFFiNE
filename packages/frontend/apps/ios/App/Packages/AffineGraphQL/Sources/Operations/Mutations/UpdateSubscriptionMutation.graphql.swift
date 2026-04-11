// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateSubscriptionMutation: GraphQLMutation {
  public static let operationName: String = "updateSubscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateSubscription($plan: SubscriptionPlan = Pro, $recurring: SubscriptionRecurring!, $workspaceId: String) { updateSubscriptionRecurring( plan: $plan recurring: $recurring workspaceId: $workspaceId ) { __typename id plan recurring nextBillAt } }"#
    ))

  public var plan: GraphQLNullable<GraphQLEnum<SubscriptionPlan>>
  public var recurring: GraphQLEnum<SubscriptionRecurring>
  public var workspaceId: GraphQLNullable<String>

  public init(
    plan: GraphQLNullable<GraphQLEnum<SubscriptionPlan>> = .init(.pro),
    recurring: GraphQLEnum<SubscriptionRecurring>,
    workspaceId: GraphQLNullable<String>
  ) {
    self.plan = plan
    self.recurring = recurring
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { [
    "plan": plan,
    "recurring": recurring,
    "workspaceId": workspaceId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateSubscriptionRecurring", UpdateSubscriptionRecurring.self, arguments: [
        "plan": .variable("plan"),
        "recurring": .variable("recurring"),
        "workspaceId": .variable("workspaceId")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      UpdateSubscriptionMutation.Data.self
    ] }

    public var updateSubscriptionRecurring: UpdateSubscriptionRecurring { __data["updateSubscriptionRecurring"] }

    /// UpdateSubscriptionRecurring
    ///
    /// Parent Type: `SubscriptionType`
    public struct UpdateSubscriptionRecurring: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SubscriptionType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String?.self),
        .field("plan", GraphQLEnum<AffineGraphQL.SubscriptionPlan>.self),
        .field("recurring", GraphQLEnum<AffineGraphQL.SubscriptionRecurring>.self),
        .field("nextBillAt", AffineGraphQL.DateTime?.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        UpdateSubscriptionMutation.Data.UpdateSubscriptionRecurring.self
      ] }

      @available(*, deprecated, message: "removed")
      public var id: String? { __data["id"] }
      /// The 'Free' plan just exists to be a placeholder and for the type convenience of frontend.
      /// There won't actually be a subscription with plan 'Free'
      public var plan: GraphQLEnum<AffineGraphQL.SubscriptionPlan> { __data["plan"] }
      public var recurring: GraphQLEnum<AffineGraphQL.SubscriptionRecurring> { __data["recurring"] }
      public var nextBillAt: AffineGraphQL.DateTime? { __data["nextBillAt"] }
    }
  }
}
