// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ChangeEmailMutation: GraphQLMutation {
  public static let operationName: String = "changeEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation changeEmail($token: String!, $email: String!) { changeEmail(token: $token, email: $email) { __typename id email } }"#
    ))

  public var token: String
  public var email: String

  public init(
    token: String,
    email: String
  ) {
    self.token = token
    self.email = email
  }

  public var __variables: Variables? { [
    "token": token,
    "email": email
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("changeEmail", ChangeEmail.self, arguments: [
        "token": .variable("token"),
        "email": .variable("email")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ChangeEmailMutation.Data.self
    ] }

    public var changeEmail: ChangeEmail { __data["changeEmail"] }

    /// ChangeEmail
    ///
    /// Parent Type: `UserType`
    public struct ChangeEmail: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("email", String.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ChangeEmailMutation.Data.ChangeEmail.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User email
      public var email: String { __data["email"] }
    }
  }
}
