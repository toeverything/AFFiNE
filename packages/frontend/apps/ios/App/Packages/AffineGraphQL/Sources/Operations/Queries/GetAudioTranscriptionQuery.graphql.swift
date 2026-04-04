// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetAudioTranscriptionQuery: GraphQLQuery {
  public static let operationName: String = "getAudioTranscription"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getAudioTranscription($workspaceId: String!, $jobId: String, $blobId: String) { currentUser { __typename copilot(workspaceId: $workspaceId) { __typename audioTranscription(jobId: $jobId, blobId: $blobId) { __typename id status title summary sourceAudio { __typename blobId mimeType durationMs sampleRate channels } quality { __typename degraded overflowCount } sliceManifest { __typename index fileName mimeType startSec durationSec byteSize } normalizedSegments { __typename speaker startSec endSec start end text } normalizedTranscript summaryJson { __typename title durationMinutes attendees keyPoints actionItems { __typename description owner deadline } decisions openQuestions blockers } transcription { __typename speaker start end transcription } } } } }"#
    ))

  public var workspaceId: String
  public var jobId: GraphQLNullable<String>
  public var blobId: GraphQLNullable<String>

  public init(
    workspaceId: String,
    jobId: GraphQLNullable<String>,
    blobId: GraphQLNullable<String>
  ) {
    self.workspaceId = workspaceId
    self.jobId = jobId
    self.blobId = blobId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "jobId": jobId,
    "blobId": blobId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("currentUser", CurrentUser?.self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetAudioTranscriptionQuery.Data.self
    ] }

    /// Get current user
    public var currentUser: CurrentUser? { __data["currentUser"] }

    /// CurrentUser
    ///
    /// Parent Type: `UserType`
    public struct CurrentUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("copilot", Copilot.self, arguments: ["workspaceId": .variable("workspaceId")]),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetAudioTranscriptionQuery.Data.CurrentUser.self
      ] }

      public var copilot: Copilot { __data["copilot"] }

      /// CurrentUser.Copilot
      ///
      /// Parent Type: `Copilot`
      public struct Copilot: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Copilot }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("audioTranscription", AudioTranscription?.self, arguments: [
            "jobId": .variable("jobId"),
            "blobId": .variable("blobId")
          ]),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.self
        ] }

        public var audioTranscription: AudioTranscription? { __data["audioTranscription"] }

        /// CurrentUser.Copilot.AudioTranscription
        ///
        /// Parent Type: `TranscriptionResultType`
        public struct AudioTranscription: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionResultType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("id", AffineGraphQL.ID.self),
            .field("status", GraphQLEnum<AffineGraphQL.AiJobStatus>.self),
            .field("title", String?.self),
            .field("summary", String?.self),
            .field("sourceAudio", SourceAudio?.self),
            .field("quality", Quality?.self),
            .field("sliceManifest", [SliceManifest]?.self),
            .field("normalizedSegments", [NormalizedSegment]?.self),
            .field("normalizedTranscript", String?.self),
            .field("summaryJson", SummaryJson?.self),
            .field("transcription", [Transcription]?.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.self
          ] }

          public var id: AffineGraphQL.ID { __data["id"] }
          public var status: GraphQLEnum<AffineGraphQL.AiJobStatus> { __data["status"] }
          public var title: String? { __data["title"] }
          public var summary: String? { __data["summary"] }
          public var sourceAudio: SourceAudio? { __data["sourceAudio"] }
          public var quality: Quality? { __data["quality"] }
          public var sliceManifest: [SliceManifest]? { __data["sliceManifest"] }
          public var normalizedSegments: [NormalizedSegment]? { __data["normalizedSegments"] }
          public var normalizedTranscript: String? { __data["normalizedTranscript"] }
          public var summaryJson: SummaryJson? { __data["summaryJson"] }
          public var transcription: [Transcription]? { __data["transcription"] }

          /// CurrentUser.Copilot.AudioTranscription.SourceAudio
          ///
          /// Parent Type: `TranscriptionSourceAudioType`
          public struct SourceAudio: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionSourceAudioType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("blobId", String?.self),
              .field("mimeType", String?.self),
              .field("durationMs", Int?.self),
              .field("sampleRate", Int?.self),
              .field("channels", Int?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.SourceAudio.self
            ] }

            public var blobId: String? { __data["blobId"] }
            public var mimeType: String? { __data["mimeType"] }
            public var durationMs: Int? { __data["durationMs"] }
            public var sampleRate: Int? { __data["sampleRate"] }
            public var channels: Int? { __data["channels"] }
          }

          /// CurrentUser.Copilot.AudioTranscription.Quality
          ///
          /// Parent Type: `TranscriptionQualityType`
          public struct Quality: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TranscriptionQualityType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("degraded", Bool?.self),
              .field("overflowCount", Int?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.Quality.self
            ] }

            public var degraded: Bool? { __data["degraded"] }
            public var overflowCount: Int? { __data["overflowCount"] }
          }

          /// CurrentUser.Copilot.AudioTranscription.SliceManifest
          ///
          /// Parent Type: `AudioSliceManifestItemType`
          public struct SliceManifest: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AudioSliceManifestItemType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("index", Int.self),
              .field("fileName", String.self),
              .field("mimeType", String.self),
              .field("startSec", Double.self),
              .field("durationSec", Double.self),
              .field("byteSize", Int?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.SliceManifest.self
            ] }

            public var index: Int { __data["index"] }
            public var fileName: String { __data["fileName"] }
            public var mimeType: String { __data["mimeType"] }
            public var startSec: Double { __data["startSec"] }
            public var durationSec: Double { __data["durationSec"] }
            public var byteSize: Int? { __data["byteSize"] }
          }

          /// CurrentUser.Copilot.AudioTranscription.NormalizedSegment
          ///
          /// Parent Type: `NormalizedTranscriptSegmentType`
          public struct NormalizedSegment: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.NormalizedTranscriptSegmentType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("speaker", String.self),
              .field("startSec", Double.self),
              .field("endSec", Double.self),
              .field("start", String.self),
              .field("end", String.self),
              .field("text", String.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.NormalizedSegment.self
            ] }

            public var speaker: String { __data["speaker"] }
            public var startSec: Double { __data["startSec"] }
            public var endSec: Double { __data["endSec"] }
            public var start: String { __data["start"] }
            public var end: String { __data["end"] }
            public var text: String { __data["text"] }
          }

          /// CurrentUser.Copilot.AudioTranscription.SummaryJson
          ///
          /// Parent Type: `MeetingSummaryV2Type`
          public struct SummaryJson: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.MeetingSummaryV2Type }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("title", String.self),
              .field("durationMinutes", Double.self),
              .field("attendees", [String].self),
              .field("keyPoints", [String].self),
              .field("actionItems", [ActionItem].self),
              .field("decisions", [String].self),
              .field("openQuestions", [String].self),
              .field("blockers", [String].self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.SummaryJson.self
            ] }

            public var title: String { __data["title"] }
            public var durationMinutes: Double { __data["durationMinutes"] }
            public var attendees: [String] { __data["attendees"] }
            public var keyPoints: [String] { __data["keyPoints"] }
            public var actionItems: [ActionItem] { __data["actionItems"] }
            public var decisions: [String] { __data["decisions"] }
            public var openQuestions: [String] { __data["openQuestions"] }
            public var blockers: [String] { __data["blockers"] }

            /// CurrentUser.Copilot.AudioTranscription.SummaryJson.ActionItem
            ///
            /// Parent Type: `MeetingActionItemType`
            public struct ActionItem: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.MeetingActionItemType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("description", String.self),
                .field("owner", String?.self),
                .field("deadline", String?.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.SummaryJson.ActionItem.self
              ] }

              public var description: String { __data["description"] }
              public var owner: String? { __data["owner"] }
              public var deadline: String? { __data["deadline"] }
            }
          }

          /// CurrentUser.Copilot.AudioTranscription.Transcription
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
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetAudioTranscriptionQuery.Data.CurrentUser.Copilot.AudioTranscription.Transcription.self
            ] }

            public var speaker: String { __data["speaker"] }
            public var start: String { __data["start"] }
            public var end: String { __data["end"] }
            public var transcription: String { __data["transcription"] }
          }
        }
      }
    }
  }
}
