// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteAuthSigningKeyMutation: GraphQLMutation {
  public static let operationName: String = "deleteAuthSigningKey"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteAuthSigningKey($id: String!) { deleteAuthSigningKey(id: $id) { __typename id status source createdAt retiredAt verifyUntil canDelete } }"#
    ))

  public var id: String

  public init(id: String) {
    self.id = id
  }

  public var __variables: Variables? { ["id": id] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("deleteAuthSigningKey", [DeleteAuthSigningKey].self, arguments: ["id": .variable("id")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      DeleteAuthSigningKeyMutation.Data.self
    ] }

    public var deleteAuthSigningKey: [DeleteAuthSigningKey] { __data["deleteAuthSigningKey"] }

    /// DeleteAuthSigningKey
    ///
    /// Parent Type: `AuthSigningKeyType`
    public struct DeleteAuthSigningKey: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AuthSigningKeyType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("status", String.self),
        .field("source", String.self),
        .field("createdAt", AffineGraphQL.DateTime?.self),
        .field("retiredAt", AffineGraphQL.DateTime?.self),
        .field("verifyUntil", AffineGraphQL.DateTime?.self),
        .field("canDelete", Bool.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        DeleteAuthSigningKeyMutation.Data.DeleteAuthSigningKey.self
      ] }

      public var id: String { __data["id"] }
      public var status: String { __data["status"] }
      public var source: String { __data["source"] }
      public var createdAt: AffineGraphQL.DateTime? { __data["createdAt"] }
      public var retiredAt: AffineGraphQL.DateTime? { __data["retiredAt"] }
      public var verifyUntil: AffineGraphQL.DateTime? { __data["verifyUntil"] }
      public var canDelete: Bool { __data["canDelete"] }
    }
  }
}
