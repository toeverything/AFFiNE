// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokProfileOrderInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    expectedRevision: SafeInt,
    profileId: ID
  ) {
    __data = InputDict([
      "expectedRevision": expectedRevision,
      "profileId": profileId
    ])
  }

  public var expectedRevision: SafeInt {
    get { __data["expectedRevision"] }
    set { __data["expectedRevision"] = newValue }
  }

  public var profileId: ID {
    get { __data["profileId"] }
    set { __data["profileId"] = newValue }
  }
}
