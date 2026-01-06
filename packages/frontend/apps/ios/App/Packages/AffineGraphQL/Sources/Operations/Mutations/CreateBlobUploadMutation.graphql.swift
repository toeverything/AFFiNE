// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateBlobUploadMutation: GraphQLMutation {
  public static let operationName: String = "createBlobUpload"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) { createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) { __typename method blobKey alreadyUploaded uploadUrl headers expiresAt uploadId partSize uploadedParts { __typename partNumber etag } } }"#
    ))

  public var workspaceId: String
  public var key: String
  public var size: Int
  public var mime: String

  public init(
    workspaceId: String,
    key: String,
    size: Int,
    mime: String
  ) {
    self.workspaceId = workspaceId
    self.key = key
    self.size = size
    self.mime = mime
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "key": key,
    "size": size,
    "mime": mime
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createBlobUpload", CreateBlobUpload.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "key": .variable("key"),
        "size": .variable("size"),
        "mime": .variable("mime")
      ]),
    ] }

    public var createBlobUpload: CreateBlobUpload { __data["createBlobUpload"] }

    /// CreateBlobUpload
    ///
    /// Parent Type: `BlobUploadInit`
    public struct CreateBlobUpload: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.BlobUploadInit }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("method", GraphQLEnum<AffineGraphQL.BlobUploadMethod>.self),
        .field("blobKey", String.self),
        .field("alreadyUploaded", Bool?.self),
        .field("uploadUrl", String?.self),
        .field("headers", AffineGraphQL.JSONObject?.self),
        .field("expiresAt", AffineGraphQL.DateTime?.self),
        .field("uploadId", String?.self),
        .field("partSize", Int?.self),
        .field("uploadedParts", [UploadedPart]?.self),
      ] }

      public var method: GraphQLEnum<AffineGraphQL.BlobUploadMethod> { __data["method"] }
      public var blobKey: String { __data["blobKey"] }
      public var alreadyUploaded: Bool? { __data["alreadyUploaded"] }
      public var uploadUrl: String? { __data["uploadUrl"] }
      public var headers: AffineGraphQL.JSONObject? { __data["headers"] }
      public var expiresAt: AffineGraphQL.DateTime? { __data["expiresAt"] }
      public var uploadId: String? { __data["uploadId"] }
      public var partSize: Int? { __data["partSize"] }
      public var uploadedParts: [UploadedPart]? { __data["uploadedParts"] }

      /// CreateBlobUpload.UploadedPart
      ///
      /// Parent Type: `BlobUploadedPart`
      public struct UploadedPart: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.BlobUploadedPart }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("partNumber", Int.self),
          .field("etag", String.self),
        ] }

        public var partNumber: Int { __data["partNumber"] }
        public var etag: String { __data["etag"] }
      }
    }
  }
}
