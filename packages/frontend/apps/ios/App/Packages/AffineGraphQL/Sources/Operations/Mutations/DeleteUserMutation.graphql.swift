// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteUserMutation: GraphQLMutation {
  public static let operationName: String = "deleteUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteUser($id: String!) { deleteUser(id: $id) { __typename success } }"#
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
      .field("deleteUser", DeleteUser.self, arguments: ["id": .variable("id")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      DeleteUserMutation.Data.self
    ] }

    /// Delete a user account
    public var deleteUser: DeleteUser { __data["deleteUser"] }

    /// DeleteUser
    ///
    /// Parent Type: `DeleteAccount`
    public struct DeleteUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DeleteAccount }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("success", Bool.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        DeleteUserMutation.Data.DeleteUser.self
      ] }

      public var success: Bool { __data["success"] }
    }
  }
}
