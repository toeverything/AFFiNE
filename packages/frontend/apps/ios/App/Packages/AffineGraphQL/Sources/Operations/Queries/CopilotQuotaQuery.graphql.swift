// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CopilotQuotaQuery: GraphQLQuery {
  public static let operationName: String = "copilotQuota"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query copilotQuota { currentUser { __typename copilot { __typename quota { __typename limit used } } } }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("currentUser", CurrentUser?.self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CopilotQuotaQuery.Data.self
    ] }

    /// Get current user
    public var currentUser: CurrentUser? { __data["currentUser"] }

    /// CurrentUser
    ///
    /// Parent Type: `UserType`
    public struct CurrentUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("copilot", Copilot.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        CopilotQuotaQuery.Data.CurrentUser.self
      ] }

      public var copilot: Copilot { __data["copilot"] }

      /// CurrentUser.Copilot
      ///
      /// Parent Type: `Copilot`
      public struct Copilot: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Copilot }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("quota", Quota.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          CopilotQuotaQuery.Data.CurrentUser.Copilot.self
        ] }

        /// Get the quota of the user in the workspace
        public var quota: Quota { __data["quota"] }

        /// CurrentUser.Copilot.Quota
        ///
        /// Parent Type: `CopilotQuota`
        public struct Quota: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotQuota }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("limit", AffineGraphQL.SafeInt?.self),
            .field("used", AffineGraphQL.SafeInt.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            CopilotQuotaQuery.Data.CurrentUser.Copilot.Quota.self
          ] }

          public var limit: AffineGraphQL.SafeInt? { __data["limit"] }
          public var used: AffineGraphQL.SafeInt { __data["used"] }
        }
      }
    }
  }
}
