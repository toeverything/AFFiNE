// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokCapabilityInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    attachmentKinds: [String],
    attachmentSources: [String],
    features: [String],
    input: [String],
    output: [String]
  ) {
    __data = InputDict([
      "attachmentKinds": attachmentKinds,
      "attachmentSources": attachmentSources,
      "features": features,
      "input": input,
      "output": output
    ])
  }

  public var attachmentKinds: [String] {
    get { __data["attachmentKinds"] }
    set { __data["attachmentKinds"] = newValue }
  }

  public var attachmentSources: [String] {
    get { __data["attachmentSources"] }
    set { __data["attachmentSources"] = newValue }
  }

  public var features: [String] {
    get { __data["features"] }
    set { __data["features"] = newValue }
  }

  public var input: [String] {
    get { __data["input"] }
    set { __data["input"] = newValue }
  }

  public var output: [String] {
    get { __data["output"] }
    set { __data["output"] = newValue }
  }
}
