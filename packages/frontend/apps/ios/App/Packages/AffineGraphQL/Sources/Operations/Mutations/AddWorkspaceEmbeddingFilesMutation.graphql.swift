// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AddWorkspaceEmbeddingFilesMutation: GraphQLMutation {
  public static let operationName: String = "addWorkspaceEmbeddingFiles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation addWorkspaceEmbeddingFiles($workspaceId: String!, $blob: Upload!) { addWorkspaceEmbeddingFiles(workspaceId: $workspaceId, blob: $blob) { __typename fileId fileName blobId mimeType size createdAt } }"#
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
      .field("addWorkspaceEmbeddingFiles", AddWorkspaceEmbeddingFiles.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "blob": .variable("blob")
      ]),
    ] }

    /// Update workspace embedding files
    public var addWorkspaceEmbeddingFiles: AddWorkspaceEmbeddingFiles { __data["addWorkspaceEmbeddingFiles"] }

    /// AddWorkspaceEmbeddingFiles
    ///
    /// Parent Type: `CopilotWorkspaceFile`
    public struct AddWorkspaceEmbeddingFiles: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceFile }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("fileId", String.self),
        .field("fileName", String.self),
        .field("blobId", String.self),
        .field("mimeType", String.self),
        .field("size", AffineGraphQL.SafeInt.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
      ] }

      public var fileId: String { __data["fileId"] }
      public var fileName: String { __data["fileName"] }
      public var blobId: String { __data["blobId"] }
      public var mimeType: String { __data["mimeType"] }
      public var size: AffineGraphQL.SafeInt { __data["size"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
    }
  }
}
