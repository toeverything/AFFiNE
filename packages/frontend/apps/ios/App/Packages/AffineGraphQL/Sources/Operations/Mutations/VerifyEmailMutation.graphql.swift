// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class VerifyEmailMutation: GraphQLMutation {
  public static let operationName: String = "verifyEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation verifyEmail($token: String!) { verifyEmail(token: $token) }"#
    ))

  public var token: String

  public init(token: String) {
    self.token = token
  }

  public var __variables: Variables? { ["token": token] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("verifyEmail", Bool.self, arguments: ["token": .variable("token")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      VerifyEmailMutation.Data.self
    ] }

    public var verifyEmail: Bool { __data["verifyEmail"] }
  }
}
