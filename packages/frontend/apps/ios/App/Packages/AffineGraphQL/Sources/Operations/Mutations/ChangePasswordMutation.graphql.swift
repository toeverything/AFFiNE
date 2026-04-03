// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ChangePasswordMutation: GraphQLMutation {
  public static let operationName: String = "changePassword"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation changePassword($token: String!, $userId: String!, $newPassword: String!) { changePassword(token: $token, userId: $userId, newPassword: $newPassword) }"#
    ))

  public var token: String
  public var userId: String
  public var newPassword: String

  public init(
    token: String,
    userId: String,
    newPassword: String
  ) {
    self.token = token
    self.userId = userId
    self.newPassword = newPassword
  }

  public var __variables: Variables? { [
    "token": token,
    "userId": userId,
    "newPassword": newPassword
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("changePassword", Bool.self, arguments: [
        "token": .variable("token"),
        "userId": .variable("userId"),
        "newPassword": .variable("newPassword")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ChangePasswordMutation.Data.self
    ] }

    public var changePassword: Bool { __data["changePassword"] }
  }
}
