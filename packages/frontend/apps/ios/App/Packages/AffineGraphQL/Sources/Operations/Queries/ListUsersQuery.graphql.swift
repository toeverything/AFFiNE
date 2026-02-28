// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListUsersQuery: GraphQLQuery {
  public static let operationName: String = "listUsers"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listUsers($filter: ListUserInput!) { users(filter: $filter) { __typename id name email disabled features hasPassword emailVerified avatarUrl } usersCount }"#
    ))

  public var filter: ListUserInput

  public init(filter: ListUserInput) {
    self.filter = filter
  }

  public var __variables: Variables? { ["filter": filter] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("users", [User].self, arguments: ["filter": .variable("filter")]),
      .field("usersCount", Int.self),
    ] }

    /// List registered users
    public var users: [User] { __data["users"] }
    /// Get users count
    public var usersCount: Int { __data["usersCount"] }

    /// User
    ///
    /// Parent Type: `UserType`
    public struct User: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("name", String.self),
        .field("email", String.self),
        .field("disabled", Bool.self),
        .field("features", [GraphQLEnum<AffineGraphQL.FeatureType>].self),
        .field("hasPassword", Bool?.self),
        .field("emailVerified", Bool.self),
        .field("avatarUrl", String?.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User name
      public var name: String { __data["name"] }
      /// User email
      public var email: String { __data["email"] }
      /// User is disabled
      public var disabled: Bool { __data["disabled"] }
      /// Enabled features of a user
      public var features: [GraphQLEnum<AffineGraphQL.FeatureType>] { __data["features"] }
      /// User password has been set
      public var hasPassword: Bool? { __data["hasPassword"] }
      /// User email verified
      public var emailVerified: Bool { __data["emailVerified"] }
      /// User avatar url
      public var avatarUrl: String? { __data["avatarUrl"] }
    }
  }
}
