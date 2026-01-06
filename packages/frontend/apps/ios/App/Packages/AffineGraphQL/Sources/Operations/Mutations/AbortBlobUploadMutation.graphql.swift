// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AbortBlobUploadMutation: GraphQLMutation {
  public static let operationName: String = "abortBlobUpload"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation abortBlobUpload($workspaceId: String!, $key: String!, $uploadId: String!) { abortBlobUpload(workspaceId: $workspaceId, key: $key, uploadId: $uploadId) }"#
    ))

  public var workspaceId: String
  public var key: String
  public var uploadId: String

  public init(
    workspaceId: String,
    key: String,
    uploadId: String
  ) {
    self.workspaceId = workspaceId
    self.key = key
    self.uploadId = uploadId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "key": key,
    "uploadId": uploadId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("abortBlobUpload", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "key": .variable("key"),
        "uploadId": .variable("uploadId")
      ]),
    ] }

    public var abortBlobUpload: Bool { __data["abortBlobUpload"] }
  }
}
