// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveWorkspaceEmbeddingIgnoredDocsMutation: GraphQLMutation {
  public static let operationName: String = "removeWorkspaceEmbeddingIgnoredDocs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeWorkspaceEmbeddingIgnoredDocs($workspaceId: String!, $remove: [String!]!) { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: $workspaceId, remove: $remove) }"#
    ))

  public var workspaceId: String
  public var remove: [String]

  public init(
    workspaceId: String,
    remove: [String]
  ) {
    self.workspaceId = workspaceId
    self.remove = remove
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "remove": remove
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateWorkspaceEmbeddingIgnoredDocs", Int.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "remove": .variable("remove")
      ]),
    ] }

    /// Update ignored docs
    public var updateWorkspaceEmbeddingIgnoredDocs: Int { __data["updateWorkspaceEmbeddingIgnoredDocs"] }
  }
}
