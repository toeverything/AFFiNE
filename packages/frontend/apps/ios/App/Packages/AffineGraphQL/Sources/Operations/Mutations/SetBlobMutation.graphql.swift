// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SetBlobMutation: GraphQLMutation {
  public static let operationName: String = "setBlob"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation setBlob($workspaceId: String!, $blob: Upload!) { setBlob(workspaceId: $workspaceId, blob: $blob) }"#
    ))

  public var workspaceId: String
  public var blob: Upload

  public init(
    workspaceId: String,
    blob: Upload
  ) {
    self.workspaceId = workspaceId
    self.blob = blob
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "blob": blob
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("setBlob", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "blob": .variable("blob")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SetBlobMutation.Data.self
    ] }

    public var setBlob: String { __data["setBlob"] }
  }
}
