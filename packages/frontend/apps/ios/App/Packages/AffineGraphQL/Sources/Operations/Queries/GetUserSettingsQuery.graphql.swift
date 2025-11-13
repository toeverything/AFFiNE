// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetUserSettingsQuery: GraphQLQuery {
  public static let operationName: String = "getUserSettings"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getUserSettings { currentUser { __typename settings { __typename receiveInvitationEmail receiveMentionEmail receiveCommentEmail } } }"#
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
        .field("settings", Settings.self),
      ] }

      /// Get user settings
      public var settings: Settings { __data["settings"] }

      /// CurrentUser.Settings
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
    }
  }
}
