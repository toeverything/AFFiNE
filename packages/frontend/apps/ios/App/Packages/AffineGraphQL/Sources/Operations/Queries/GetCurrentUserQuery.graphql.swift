// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCurrentUserQuery: GraphQLQuery {
  public static let operationName: String = "getCurrentUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCurrentUser { currentUser { __typename id name email emailVerified avatarUrl token { __typename sessionToken } } }"#
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
      GetCurrentUserQuery.Data.self
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
        .field("id", AffineGraphQL.ID.self),
        .field("name", String.self),
        .field("email", String.self),
        .field("emailVerified", Bool.self),
        .field("avatarUrl", String?.self),
        .field("token", Token.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetCurrentUserQuery.Data.CurrentUser.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User name
      public var name: String { __data["name"] }
      /// User email
      public var email: String { __data["email"] }
      /// User email verified
      public var emailVerified: Bool { __data["emailVerified"] }
      /// User avatar url
      public var avatarUrl: String? { __data["avatarUrl"] }
      @available(*, deprecated, message: "use [/api/auth/sign-in?native=true] instead")
      public var token: Token { __data["token"] }

      /// CurrentUser.Token
      ///
      /// Parent Type: `TokenType`
      public struct Token: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TokenType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("sessionToken", String?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetCurrentUserQuery.Data.CurrentUser.Token.self
        ] }

        public var sessionToken: String? { __data["sessionToken"] }
      }
    }
  }
}
