// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct CurrentUserProfile: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment CurrentUserProfile on UserType { __typename id name email avatarUrl emailVerified features settings { __typename receiveInvitationEmail receiveMentionEmail receiveCommentEmail } quota { __typename name blobLimit storageQuota historyPeriod memberLimit humanReadable { __typename name blobLimit storageQuota historyPeriod memberLimit } } quotaUsage { __typename storageQuota } copilot { __typename quota { __typename limit used } } }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("id", AffineGraphQL.ID.self),
    .field("name", String.self),
    .field("email", String.self),
    .field("avatarUrl", String?.self),
    .field("emailVerified", Bool.self),
    .field("features", [GraphQLEnum<AffineGraphQL.FeatureType>].self),
    .field("settings", Settings.self),
    .field("quota", Quota.self),
    .field("quotaUsage", QuotaUsage.self),
    .field("copilot", Copilot.self),
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

  /// Settings
  ///
  /// Parent Type: `UserSettingsType`
  public struct Settings: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserSettingsType }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("receiveInvitationEmail", Bool.self),
      .field("receiveMentionEmail", Bool.self),
      .field("receiveCommentEmail", Bool.self),
    ] }

    /// Receive invitation email
    public var receiveInvitationEmail: Bool { __data["receiveInvitationEmail"] }
    /// Receive mention email
    public var receiveMentionEmail: Bool { __data["receiveMentionEmail"] }
    /// Receive comment email
    public var receiveCommentEmail: Bool { __data["receiveCommentEmail"] }
  }

  /// Quota
  ///
  /// Parent Type: `UserQuotaType`
  public struct Quota: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserQuotaType }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("name", String.self),
      .field("blobLimit", AffineGraphQL.SafeInt.self),
      .field("storageQuota", AffineGraphQL.SafeInt.self),
      .field("historyPeriod", AffineGraphQL.SafeInt.self),
      .field("memberLimit", Int.self),
      .field("humanReadable", HumanReadable.self),
    ] }

    public var name: String { __data["name"] }
    public var blobLimit: AffineGraphQL.SafeInt { __data["blobLimit"] }
    public var storageQuota: AffineGraphQL.SafeInt { __data["storageQuota"] }
    public var historyPeriod: AffineGraphQL.SafeInt { __data["historyPeriod"] }
    public var memberLimit: Int { __data["memberLimit"] }
    public var humanReadable: HumanReadable { __data["humanReadable"] }

    /// Quota.HumanReadable
    ///
    /// Parent Type: `UserQuotaHumanReadableType`
    public struct HumanReadable: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserQuotaHumanReadableType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("name", String.self),
        .field("blobLimit", String.self),
        .field("storageQuota", String.self),
        .field("historyPeriod", String.self),
        .field("memberLimit", String.self),
      ] }

      public var name: String { __data["name"] }
      public var blobLimit: String { __data["blobLimit"] }
      public var storageQuota: String { __data["storageQuota"] }
      public var historyPeriod: String { __data["historyPeriod"] }
      public var memberLimit: String { __data["memberLimit"] }
    }
  }

  /// QuotaUsage
  ///
  /// Parent Type: `UserQuotaUsageType`
  public struct QuotaUsage: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserQuotaUsageType }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("storageQuota", AffineGraphQL.SafeInt.self),
    ] }

    @available(*, deprecated, message: "use `UserQuotaType[\'usedStorageQuota\']` instead")
    public var storageQuota: AffineGraphQL.SafeInt { __data["storageQuota"] }
  }

  /// Copilot
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

    /// Get the quota of the user in the workspace
    public var quota: Quota { __data["quota"] }

    /// Copilot.Quota
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

      public var limit: AffineGraphQL.SafeInt? { __data["limit"] }
      public var used: AffineGraphQL.SafeInt { __data["used"] }
    }
  }
}
