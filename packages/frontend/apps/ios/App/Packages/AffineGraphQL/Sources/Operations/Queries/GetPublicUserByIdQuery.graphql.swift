// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetPublicUserByIdQuery: GraphQLQuery {
  public static let operationName: String = "getPublicUserById"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getPublicUserById($id: String!) { publicUserById(id: $id) { __typename id avatarUrl name } }"#
    ))

  public var id: String

  public init(id: String) {
    self.id = id
  }

  public var __variables: Variables? { ["id": id] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("publicUserById", PublicUserById?.self, arguments: ["id": .variable("id")]),
    ] }

    /// Get public user by id
    public var publicUserById: PublicUserById? { __data["publicUserById"] }

    /// PublicUserById
    ///
    /// Parent Type: `PublicUserType`
    public struct PublicUserById: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PublicUserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("avatarUrl", String?.self),
        .field("name", String.self),
      ] }

      public var id: String { __data["id"] }
      public var avatarUrl: String? { __data["avatarUrl"] }
      public var name: String { __data["name"] }
    }
  }
}
