// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct TranscriptionSourceAudioInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    channels: GraphQLNullable<Int> = nil,
    durationMs: GraphQLNullable<Int> = nil,
    mimeType: GraphQLNullable<String> = nil,
    sampleRate: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "channels": channels,
      "durationMs": durationMs,
      "mimeType": mimeType,
      "sampleRate": sampleRate
    ])
  }

  public var channels: GraphQLNullable<Int> {
    get { __data["channels"] }
    set { __data["channels"] = newValue }
  }

  public var durationMs: GraphQLNullable<Int> {
    get { __data["durationMs"] }
    set { __data["durationMs"] = newValue }
  }

  public var mimeType: GraphQLNullable<String> {
    get { __data["mimeType"] }
    set { __data["mimeType"] = newValue }
  }

  public var sampleRate: GraphQLNullable<Int> {
    get { __data["sampleRate"] }
    set { __data["sampleRate"] = newValue }
  }
}
