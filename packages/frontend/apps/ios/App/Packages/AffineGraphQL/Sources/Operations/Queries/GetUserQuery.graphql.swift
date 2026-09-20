// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetUserQuery: GraphQLQuery {
  public static let operationName: String = "getUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getUser($email: String!) { user(email: $email) { __typename ... on UserType { id name avatarUrl email hasPassword } ... on LimitedUserType { email hasPassword } } }"#
    ))

  public var email: String

  public init(email: String) {
    self.email = email
  }

  public var __variables: Variables? { ["email": email] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("user", User?.self, arguments: ["email": .variable("email")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetUserQuery.Data.self
    ] }

    /// Get user by email
    public var user: User? { __data["user"] }

    /// User
    ///
    /// Parent Type: `UserOrLimitedUser`
    public struct User: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Unions.UserOrLimitedUser }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .inlineFragment(AsUserType.self),
        .inlineFragment(AsLimitedUserType.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetUserQuery.Data.User.self
      ] }

      public var asUserType: AsUserType? { _asInlineFragment() }
      public var asLimitedUserType: AsLimitedUserType? { _asInlineFragment() }

      /// User.AsUserType
      ///
      /// Parent Type: `UserType`
      public struct AsUserType: AffineGraphQL.InlineFragment {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public typealias RootEntityType = GetUserQuery.Data.User
        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("id", AffineGraphQL.ID.self),
          .field("name", String.self),
          .field("avatarUrl", String?.self),
          .field("email", String.self),
          .field("hasPassword", Bool?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetUserQuery.Data.User.self,
          GetUserQuery.Data.User.AsUserType.self
        ] }

        public var id: AffineGraphQL.ID { __data["id"] }
        /// User name
        public var name: String { __data["name"] }
        /// User avatar url
        public var avatarUrl: String? { __data["avatarUrl"] }
        /// User email
        public var email: String { __data["email"] }
        /// User password has been set
        public var hasPassword: Bool? { __data["hasPassword"] }
      }

      /// User.AsLimitedUserType
      ///
      /// Parent Type: `LimitedUserType`
      public struct AsLimitedUserType: AffineGraphQL.InlineFragment {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public typealias RootEntityType = GetUserQuery.Data.User
        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.LimitedUserType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("email", String.self),
          .field("hasPassword", Bool?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetUserQuery.Data.User.self,
          GetUserQuery.Data.User.AsLimitedUserType.self
        ] }

        /// User email
        public var email: String { __data["email"] }
        /// User password has been set
        public var hasPassword: Bool? { __data["hasPassword"] }
      }
    }
  }
}
