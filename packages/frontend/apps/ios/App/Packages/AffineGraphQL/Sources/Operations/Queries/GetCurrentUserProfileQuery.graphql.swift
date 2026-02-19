// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCurrentUserProfileQuery: GraphQLQuery {
  public static let operationName: String = "getCurrentUserProfile"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCurrentUserProfile { currentUser { __typename ...CurrentUserProfile } }"#,
      fragments: [CurrentUserProfile.self]
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("currentUser", CurrentUser?.self),
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
        .fragment(CurrentUserProfile.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User name
      public var name: String { __data["name"] }
      /// User email
      public var email: String { __data["email"] }
      /// User avatar url
      public var avatarUrl: String? { __data["avatarUrl"] }
      /// User email verified
      public var emailVerified: Bool { __data["emailVerified"] }
      /// Enabled features of a user
      public var features: [GraphQLEnum<AffineGraphQL.FeatureType>] { __data["features"] }
      /// Get user settings
      public var settings: Settings { __data["settings"] }
      public var quota: Quota { __data["quota"] }
      public var quotaUsage: QuotaUsage { __data["quotaUsage"] }
      public var copilot: Copilot { __data["copilot"] }

      public struct Fragments: FragmentContainer {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public var currentUserProfile: CurrentUserProfile { _toFragment() }
      }

      public typealias Settings = CurrentUserProfile.Settings

      public typealias Quota = CurrentUserProfile.Quota

      public typealias QuotaUsage = CurrentUserProfile.QuotaUsage

      public typealias Copilot = CurrentUserProfile.Copilot
    }
  }
}
