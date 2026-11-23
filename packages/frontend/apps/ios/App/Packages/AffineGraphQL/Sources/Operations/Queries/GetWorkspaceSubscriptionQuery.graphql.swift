// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceSubscriptionQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceSubscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceSubscription($workspaceId: String!) { workspace(id: $workspaceId) { __typename subscription { __typename id status plan recurring start end nextBillAt canceledAt variant } } }"#
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetWorkspaceSubscriptionQuery.Data.self
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
        .field("subscription", Subscription?.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetWorkspaceSubscriptionQuery.Data.Workspace.self
      ] }

      /// The team subscription of the workspace, if exists.
      public var subscription: Subscription? { __data["subscription"] }

      /// Workspace.Subscription
      ///
      /// Parent Type: `SubscriptionType`
      public struct Subscription: AffineGraphQL.SelectionSet {
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
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetWorkspaceSubscriptionQuery.Data.Workspace.Subscription.self
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
}
