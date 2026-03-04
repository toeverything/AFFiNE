// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetBlobUploadPartUrlQuery: GraphQLQuery {
  public static let operationName: String = "getBlobUploadPartUrl"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getBlobUploadPartUrl($workspaceId: String!, $key: String!, $uploadId: String!, $partNumber: Int!) { workspace(id: $workspaceId) { __typename blobUploadPartUrl(key: $key, uploadId: $uploadId, partNumber: $partNumber) { __typename uploadUrl headers expiresAt } } }"#
    ))

  public var workspaceId: String
  public var key: String
  public var uploadId: String
  public var partNumber: Int

  public init(
    workspaceId: String,
    key: String,
    uploadId: String,
    partNumber: Int
  ) {
    self.workspaceId = workspaceId
    self.key = key
    self.uploadId = uploadId
    self.partNumber = partNumber
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "key": key,
    "uploadId": uploadId,
    "partNumber": partNumber
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("blobUploadPartUrl", BlobUploadPartUrl.self, arguments: [
          "key": .variable("key"),
          "uploadId": .variable("uploadId"),
          "partNumber": .variable("partNumber")
        ]),
      ] }

      /// Get blob upload part url
      public var blobUploadPartUrl: BlobUploadPartUrl { __data["blobUploadPartUrl"] }

      /// Workspace.BlobUploadPartUrl
      ///
      /// Parent Type: `BlobUploadPart`
      public struct BlobUploadPartUrl: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.BlobUploadPart }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("uploadUrl", String.self),
          .field("headers", AffineGraphQL.JSONObject?.self),
          .field("expiresAt", AffineGraphQL.DateTime?.self),
        ] }

        public var uploadUrl: String { __data["uploadUrl"] }
        public var headers: AffineGraphQL.JSONObject? { __data["headers"] }
        public var expiresAt: AffineGraphQL.DateTime? { __data["expiresAt"] }
      }
    }
  }
}
