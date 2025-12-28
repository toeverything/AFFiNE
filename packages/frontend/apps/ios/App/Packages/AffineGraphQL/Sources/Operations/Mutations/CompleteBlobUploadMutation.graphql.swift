// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CompleteBlobUploadMutation: GraphQLMutation {
  public static let operationName: String = "completeBlobUpload"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation completeBlobUpload($workspaceId: String!, $key: String!, $uploadId: String, $parts: [BlobUploadPartInput!]) { completeBlobUpload( workspaceId: $workspaceId key: $key uploadId: $uploadId parts: $parts ) }"#
    ))

  public var workspaceId: String
  public var key: String
  public var uploadId: GraphQLNullable<String>
  public var parts: GraphQLNullable<[BlobUploadPartInput]>

  public init(
    workspaceId: String,
    key: String,
    uploadId: GraphQLNullable<String>,
    parts: GraphQLNullable<[BlobUploadPartInput]>
  ) {
    self.workspaceId = workspaceId
    self.key = key
    self.uploadId = uploadId
    self.parts = parts
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "key": key,
    "uploadId": uploadId,
    "parts": parts
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("completeBlobUpload", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "key": .variable("key"),
        "uploadId": .variable("uploadId"),
        "parts": .variable("parts")
      ]),
    ] }

    public var completeBlobUpload: String { __data["completeBlobUpload"] }
  }
}
