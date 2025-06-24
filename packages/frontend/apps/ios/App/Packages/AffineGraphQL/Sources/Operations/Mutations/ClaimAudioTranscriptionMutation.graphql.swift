// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ClaimAudioTranscriptionMutation: GraphQLMutation {
  public static let operationName: String = "claimAudioTranscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation claimAudioTranscription($jobId: String!) { claimAudioTranscription(jobId: $jobId) { __typename id status title summary actions transcription { __typename speaker start end transcription } } }"#
    ))

  public var jobId: String

  public init(jobId: String) {
    self.jobId = jobId
  }

  public var __variables: Variables? { ["jobId": jobId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("claimAudioTranscription", ClaimAudioTranscription?.self, arguments: ["jobId": .variable("jobId")]),
    ] }

    public var claimAudioTranscription: ClaimAudioTranscription? { __data["claimAudioTranscription"] }

    /// ClaimAudioTranscription
    ///
    /// Parent Type: `TranscriptionResultType`
    public struct ClaimAudioTranscription: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("status", GraphQLEnum<AffineGraphQL.AiJobStatus>.self),
        .field("title", String?.self),
        .field("summary", String?.self),
        .field("actions", String?.self),
        .field("transcription", [Transcription]?.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var status: GraphQLEnum<AffineGraphQL.AiJobStatus> { __data["status"] }
      public var title: String? { __data["title"] }
      public var summary: String? { __data["summary"] }
      public var actions: String? { __data["actions"] }
      public var transcription: [Transcription]? { __data["transcription"] }

      /// ClaimAudioTranscription.Transcription
      ///
      /// Parent Type: `TranscriptionItemType`
      public struct Transcription: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionItemType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("speaker", String.self),
          .field("start", String.self),
          .field("end", String.self),
          .field("transcription", String.self),
        ] }

        public var speaker: String { __data["speaker"] }
        public var start: String { __data["start"] }
        public var end: String { __data["end"] }
        public var transcription: String { __data["transcription"] }
      }
    }
  }
}
