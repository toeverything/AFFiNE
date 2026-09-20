// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokCapabilityInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    attachmentKinds: [GraphQLEnum<ByokAttachmentKind>],
    attachmentSources: [GraphQLEnum<ByokAttachmentSource>],
    features: [GraphQLEnum<ByokModelFeature>],
    input: [GraphQLEnum<ByokModelInput>],
    output: [GraphQLEnum<ByokModelOutput>]
  ) {
    __data = InputDict([
      "attachmentKinds": attachmentKinds,
      "attachmentSources": attachmentSources,
      "features": features,
      "input": input,
      "output": output
    ])
  }

  public var attachmentKinds: [GraphQLEnum<ByokAttachmentKind>] {
    get { __data["attachmentKinds"] }
    set { __data["attachmentKinds"] = newValue }
  }

  public var attachmentSources: [GraphQLEnum<ByokAttachmentSource>] {
    get { __data["attachmentSources"] }
    set { __data["attachmentSources"] = newValue }
  }

  public var features: [GraphQLEnum<ByokModelFeature>] {
    get { __data["features"] }
    set { __data["features"] = newValue }
  }

  public var input: [GraphQLEnum<ByokModelInput>] {
    get { __data["input"] }
    set { __data["input"] = newValue }
  }

  public var output: [GraphQLEnum<ByokModelOutput>] {
    get { __data["output"] }
    set { __data["output"] = newValue }
  }
}
