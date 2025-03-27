// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeactivateLicenseMutation: GraphQLMutation {
  public static let operationName: String = "deactivateLicense"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deactivateLicense($workspaceId: String!) { deactivateLicense(workspaceId: $workspaceId) }"#
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("deactivateLicense", Bool.self, arguments: ["workspaceId": .variable("workspaceId")]),
    ] }

    public var deactivateLicense: Bool { __data["deactivateLicense"] }
  }
}
