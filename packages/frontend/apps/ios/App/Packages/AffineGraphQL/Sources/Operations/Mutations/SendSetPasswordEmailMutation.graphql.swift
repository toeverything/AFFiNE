// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SendSetPasswordEmailMutation: GraphQLMutation {
  public static let operationName: String = "sendSetPasswordEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation sendSetPasswordEmail($callbackUrl: String!) { sendSetPasswordEmail(callbackUrl: $callbackUrl) }"#
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
      .field("sendSetPasswordEmail", Bool.self, arguments: ["callbackUrl": .variable("callbackUrl")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SendSetPasswordEmailMutation.Data.self
    ] }

    public var sendSetPasswordEmail: Bool { __data["sendSetPasswordEmail"] }
  }
}
