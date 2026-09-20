// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RevokeMcpCredentialMutation: GraphQLMutation {
  public static let operationName: String = "revokeMcpCredential"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation revokeMcpCredential($id: ID!, $workspaceId: String!) { revokeMcpCredential(id: $id, workspaceId: $workspaceId) }"#
    ))

  public var id: ID
  public var workspaceId: String

  public init(
    id: ID,
    workspaceId: String
  ) {
    self.id = id
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { [
    "id": id,
    "workspaceId": workspaceId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("revokeMcpCredential", Bool.self, arguments: [
        "id": .variable("id"),
        "workspaceId": .variable("workspaceId")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      RevokeMcpCredentialMutation.Data.self
    ] }

    public var revokeMcpCredential: Bool { __data["revokeMcpCredential"] }
  }
}
