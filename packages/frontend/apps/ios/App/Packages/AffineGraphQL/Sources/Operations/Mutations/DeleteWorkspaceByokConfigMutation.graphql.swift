// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteWorkspaceByokConfigMutation: GraphQLMutation {
  public static let operationName: String = "deleteWorkspaceByokConfig"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteWorkspaceByokConfig($workspaceId: String!, $id: ID!) { deleteWorkspaceByokConfig(workspaceId: $workspaceId, id: $id) }"#
    ))

  public var workspaceId: String
  public var id: ID

  public init(
    workspaceId: String,
    id: ID
  ) {
    self.workspaceId = workspaceId
    self.id = id
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "id": id
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("deleteWorkspaceByokConfig", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "id": .variable("id")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      DeleteWorkspaceByokConfigMutation.Data.self
    ] }

    public var deleteWorkspaceByokConfig: Bool { __data["deleteWorkspaceByokConfig"] }
  }
}
