// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SubmitAudioTranscriptionMutation: GraphQLMutation {
  public static let operationName: String = "submitAudioTranscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation submitAudioTranscription($workspaceId: String!, $blobId: String!, $blob: Upload, $blobs: [Upload!]) { submitAudioTranscription( blob: $blob blobs: $blobs blobId: $blobId workspaceId: $workspaceId ) { __typename id status } }"#
    ))

  public var workspaceId: String
  public var blobId: String
  public var blob: GraphQLNullable<Upload>
  public var blobs: GraphQLNullable<[Upload]>

  public init(
    workspaceId: String,
    blobId: String,
    blob: GraphQLNullable<Upload>,
    blobs: GraphQLNullable<[Upload]>
  ) {
    self.workspaceId = workspaceId
    self.blobId = blobId
    self.blob = blob
    self.blobs = blobs
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "blobId": blobId,
    "blob": blob,
    "blobs": blobs
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("submitAudioTranscription", SubmitAudioTranscription?.self, arguments: [
        "blob": .variable("blob"),
        "blobs": .variable("blobs"),
        "blobId": .variable("blobId"),
        "workspaceId": .variable("workspaceId")
      ]),
    ] }

    public var submitAudioTranscription: SubmitAudioTranscription? { __data["submitAudioTranscription"] }

    /// SubmitAudioTranscription
    ///
    /// Parent Type: `TranscriptionResultType`
    public struct SubmitAudioTranscription: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("status", GraphQLEnum<AffineGraphQL.AiJobStatus>.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var status: GraphQLEnum<AffineGraphQL.AiJobStatus> { __data["status"] }
    }
  }
}
