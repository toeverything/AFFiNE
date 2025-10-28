// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GenerateUserAccessTokenMutation: GraphQLMutation {
  public static let operationName: String = "generateUserAccessToken"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation generateUserAccessToken($input: GenerateAccessTokenInput!) { generateUserAccessToken(input: $input) { __typename id name token createdAt expiresAt } }"#
    ))

  public var input: GenerateAccessTokenInput

  public init(input: GenerateAccessTokenInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("generateUserAccessToken", GenerateUserAccessToken.self, arguments: ["input": .variable("input")]),
    ] }

    public var generateUserAccessToken: GenerateUserAccessToken { __data["generateUserAccessToken"] }

    /// GenerateUserAccessToken
    ///
    /// Parent Type: `RevealedAccessToken`
    public struct GenerateUserAccessToken: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.RevealedAccessToken }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("name", String.self),
        .field("token", String.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
        .field("expiresAt", AffineGraphQL.DateTime?.self),
      ] }

      public var id: String { __data["id"] }
      public var name: String { __data["name"] }
      public var token: String { __data["token"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      public var expiresAt: AffineGraphQL.DateTime? { __data["expiresAt"] }
    }
  }
}
