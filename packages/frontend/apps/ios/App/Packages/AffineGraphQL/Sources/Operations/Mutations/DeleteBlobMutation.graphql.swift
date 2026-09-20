// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteBlobMutation: GraphQLMutation {
  public static let operationName: String = "deleteBlob"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteBlob($workspaceId: String!, $key: String!, $permanently: Boolean) { deleteBlob(workspaceId: $workspaceId, key: $key, permanently: $permanently) }"#
    ))

  public var workspaceId: String
  public var key: String
  public var permanently: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    key: String,
    permanently: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.key = key
    self.permanently = permanently
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "key": key,
    "permanently": permanently
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("deleteBlob", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "key": .variable("key"),
        "permanently": .variable("permanently")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      DeleteBlobMutation.Data.self
    ] }

    public var deleteBlob: Bool { __data["deleteBlob"] }
  }
}
