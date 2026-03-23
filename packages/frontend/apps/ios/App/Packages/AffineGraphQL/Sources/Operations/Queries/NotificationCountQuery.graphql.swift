// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class NotificationCountQuery: GraphQLQuery {
  public static let operationName: String = "notificationCount"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query notificationCount { currentUser { __typename notifications(pagination: { first: 1 }) { __typename totalCount } } }"#
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
        .field("notifications", Notifications.self, arguments: ["pagination": ["first": 1]]),
      ] }

      /// Get current user notifications
      public var notifications: Notifications { __data["notifications"] }

      /// CurrentUser.Notifications
      ///
      /// Parent Type: `PaginatedNotificationObjectType`
      public struct Notifications: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedNotificationObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("totalCount", Int.self),
        ] }

        public var totalCount: Int { __data["totalCount"] }
      }
    }
  }
}
