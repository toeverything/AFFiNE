// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveWorkspaceEmbeddingFilesMutation: GraphQLMutation {
  public static let operationName: String = "removeWorkspaceEmbeddingFiles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeWorkspaceEmbeddingFiles($workspaceId: String!, $fileId: String!) { removeWorkspaceEmbeddingFiles(workspaceId: $workspaceId, fileId: $fileId) }"#
    ))

  public var workspaceId: String
  public var fileId: String

  public init(
    workspaceId: String,
    fileId: String
  ) {
    self.workspaceId = workspaceId
    self.fileId = fileId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "fileId": fileId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeWorkspaceEmbeddingFiles", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "fileId": .variable("fileId")
      ]),
    ] }

    /// Remove workspace embedding files
    public var removeWorkspaceEmbeddingFiles: Bool { __data["removeWorkspaceEmbeddingFiles"] }
  }
}
