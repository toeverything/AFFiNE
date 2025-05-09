// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GenerateLicenseKeyMutation: GraphQLMutation {
  public static let operationName: String = "generateLicenseKey"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation generateLicenseKey($sessionId: String!) { generateLicenseKey(sessionId: $sessionId) }"#
    ))

  public var sessionId: String

  public init(sessionId: String) {
    self.sessionId = sessionId
  }

  public var __variables: Variables? { ["sessionId": sessionId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("generateLicenseKey", String.self, arguments: ["sessionId": .variable("sessionId")]),
    ] }

    public var generateLicenseKey: String { __data["generateLicenseKey"] }
  }
}
