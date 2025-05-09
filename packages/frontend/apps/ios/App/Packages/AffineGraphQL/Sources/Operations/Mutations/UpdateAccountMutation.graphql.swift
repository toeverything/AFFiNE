// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateAccountMutation: GraphQLMutation {
  public static let operationName: String = "updateAccount"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateAccount($id: String!, $input: ManageUserInput!) { updateUser(id: $id, input: $input) { __typename id name email } }"#
    ))

  public var id: String
  public var input: ManageUserInput

  public init(
    id: String,
    input: ManageUserInput
  ) {
    self.id = id
    self.input = input
  }

  public var __variables: Variables? { [
    "id": id,
    "input": input
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateUser", UpdateUser.self, arguments: [
        "id": .variable("id"),
        "input": .variable("input")
      ]),
    ] }

    /// Update an user
    public var updateUser: UpdateUser { __data["updateUser"] }

    /// UpdateUser
    ///
    /// Parent Type: `UserType`
    public struct UpdateUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("name", String.self),
        .field("email", String.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User name
      public var name: String { __data["name"] }
      /// User email
      public var email: String { __data["email"] }
    }
  }
}
