// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SubmitTranscriptTaskMutation: GraphQLMutation {
  public static let operationName: String = "submitTranscriptTask"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation submitTranscriptTask($workspaceId: String!, $blobId: String!, $blob: Upload, $blobs: [Upload!], $input: SubmitAudioTranscriptionInput) { submitTranscriptTask( blob: $blob blobs: $blobs blobId: $blobId workspaceId: $workspaceId input: $input ) { __typename id status } }"#
    ))

  public var workspaceId: String
  public var blobId: String
  public var blob: GraphQLNullable<Upload>
  public var blobs: GraphQLNullable<[Upload]>
  public var input: GraphQLNullable<SubmitAudioTranscriptionInput>

  public init(
    workspaceId: String,
    blobId: String,
    blob: GraphQLNullable<Upload>,
    blobs: GraphQLNullable<[Upload]>,
    input: GraphQLNullable<SubmitAudioTranscriptionInput>
  ) {
    self.workspaceId = workspaceId
    self.blobId = blobId
    self.blob = blob
    self.blobs = blobs
    self.input = input
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "blobId": blobId,
    "blob": blob,
    "blobs": blobs,
    "input": input
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("submitTranscriptTask", SubmitTranscriptTask?.self, arguments: [
        "blob": .variable("blob"),
        "blobs": .variable("blobs"),
        "blobId": .variable("blobId"),
        "workspaceId": .variable("workspaceId"),
        "input": .variable("input")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SubmitTranscriptTaskMutation.Data.self
    ] }

    public var submitTranscriptTask: SubmitTranscriptTask? { __data["submitTranscriptTask"] }

    /// SubmitTranscriptTask
    ///
    /// Parent Type: `TranscriptionResultType`
    public struct SubmitTranscriptTask: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("status", GraphQLEnum<AffineGraphQL.AiJobStatus>.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        SubmitTranscriptTaskMutation.Data.SubmitTranscriptTask.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var status: GraphQLEnum<AffineGraphQL.AiJobStatus> { __data["status"] }
    }
  }
}
