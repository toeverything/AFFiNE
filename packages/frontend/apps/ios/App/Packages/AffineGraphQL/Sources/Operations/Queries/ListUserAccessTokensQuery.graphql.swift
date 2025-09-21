// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListUserAccessTokensQuery: GraphQLQuery {
  public static let operationName: String = "listUserAccessTokens"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listUserAccessTokens { accessTokens { __typename id name createdAt expiresAt } }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("accessTokens", [AccessToken].self),
    ] }

    public var accessTokens: [AccessToken] { __data["accessTokens"] }

    /// AccessToken
    ///
    /// Parent Type: `AccessToken`
    public struct AccessToken: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AccessToken }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("name", String.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
        .field("expiresAt", AffineGraphQL.DateTime?.self),
      ] }

      public var id: String { __data["id"] }
      public var name: String { __data["name"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      public var expiresAt: AffineGraphQL.DateTime? { __data["expiresAt"] }
    }
  }
}
