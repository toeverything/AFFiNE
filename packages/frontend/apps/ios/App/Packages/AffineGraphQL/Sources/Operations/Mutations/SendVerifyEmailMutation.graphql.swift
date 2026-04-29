// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SendVerifyEmailMutation: GraphQLMutation {
  public static let operationName: String = "sendVerifyEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation sendVerifyEmail($callbackUrl: String!) { sendVerifyEmail(callbackUrl: $callbackUrl) }"#
    ))

  public var callbackUrl: String

  public init(callbackUrl: String) {
    self.callbackUrl = callbackUrl
  }

  public var __variables: Variables? { ["callbackUrl": callbackUrl] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("sendVerifyEmail", Bool.self, arguments: ["callbackUrl": .variable("callbackUrl")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SendVerifyEmailMutation.Data.self
    ] }

    public var sendVerifyEmail: Bool { __data["sendVerifyEmail"] }
  }
}
