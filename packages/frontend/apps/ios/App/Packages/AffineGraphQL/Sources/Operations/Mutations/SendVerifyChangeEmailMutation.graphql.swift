// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SendVerifyChangeEmailMutation: GraphQLMutation {
  public static let operationName: String = "sendVerifyChangeEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation sendVerifyChangeEmail($token: String!, $email: String!, $callbackUrl: String!) { sendVerifyChangeEmail(token: $token, email: $email, callbackUrl: $callbackUrl) }"#
    ))

  public var token: String
  public var email: String
  public var callbackUrl: String

  public init(
    token: String,
    email: String,
    callbackUrl: String
  ) {
    self.token = token
    self.email = email
    self.callbackUrl = callbackUrl
  }

  public var __variables: Variables? { [
    "token": token,
    "email": email,
    "callbackUrl": callbackUrl
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("sendVerifyChangeEmail", Bool.self, arguments: [
        "token": .variable("token"),
        "email": .variable("email"),
        "callbackUrl": .variable("callbackUrl")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SendVerifyChangeEmailMutation.Data.self
    ] }

    public var sendVerifyChangeEmail: Bool { __data["sendVerifyChangeEmail"] }
  }
}
