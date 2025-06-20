// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AddWorkspaceEmbeddingIgnoredDocsMutation: GraphQLMutation {
  public static let operationName: String = "addWorkspaceEmbeddingIgnoredDocs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation addWorkspaceEmbeddingIgnoredDocs($workspaceId: String!, $add: [String!]!) { updateWorkspaceEmbeddingIgnoredDocs(workspaceId: $workspaceId, add: $add) }"#
    ))

  public var workspaceId: String
  public var add: [String]

  public init(
    workspaceId: String,
    add: [String]
  ) {
    self.workspaceId = workspaceId
    self.add = add
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "add": add
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateWorkspaceEmbeddingIgnoredDocs", Int.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "add": .variable("add")
      ]),
    ] }

    /// Update ignored docs
    public var updateWorkspaceEmbeddingIgnoredDocs: Int { __data["updateWorkspaceEmbeddingIgnoredDocs"] }
  }
}
