// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SubmitAudioTranscriptionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    quality: GraphQLNullable<TranscriptionQualityInput> = nil,
    sliceManifest: GraphQLNullable<[AudioSliceManifestItemInput]> = nil,
    sourceAudio: GraphQLNullable<TranscriptionSourceAudioInput> = nil
  ) {
    __data = InputDict([
      "quality": quality,
      "sliceManifest": sliceManifest,
      "sourceAudio": sourceAudio
    ])
  }

  public var quality: GraphQLNullable<TranscriptionQualityInput> {
    get { __data["quality"] }
    set { __data["quality"] = newValue }
  }

  public var sliceManifest: GraphQLNullable<[AudioSliceManifestItemInput]> {
    get { __data["sliceManifest"] }
    set { __data["sliceManifest"] = newValue }
  }

  public var sourceAudio: GraphQLNullable<TranscriptionSourceAudioInput> {
    get { __data["sourceAudio"] }
    set { __data["sourceAudio"] = newValue }
  }
}
