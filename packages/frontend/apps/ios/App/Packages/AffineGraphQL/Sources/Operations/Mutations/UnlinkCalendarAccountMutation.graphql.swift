// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UnlinkCalendarAccountMutation: GraphQLMutation {
  public static let operationName: String = "unlinkCalendarAccount"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation unlinkCalendarAccount($accountId: String!) { unlinkCalendarAccount(accountId: $accountId) }"#
    ))

  public var accountId: String

  public init(accountId: String) {
    self.accountId = accountId
  }

  public var __variables: Variables? { ["accountId": accountId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("unlinkCalendarAccount", Bool.self, arguments: ["accountId": .variable("accountId")]),
    ] }

    public var unlinkCalendarAccount: Bool { __data["unlinkCalendarAccount"] }
  }
}
