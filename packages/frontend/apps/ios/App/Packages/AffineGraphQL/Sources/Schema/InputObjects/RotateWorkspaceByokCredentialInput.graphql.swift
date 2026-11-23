// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct RotateWorkspaceByokCredentialInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    credential: String,
    expectedRevision: SafeInt,
    profileId: ID,
    workspaceId: String
  ) {
    __data = InputDict([
      "credential": credential,
      "expectedRevision": expectedRevision,
      "profileId": profileId,
      "workspaceId": workspaceId
    ])
  }

  public var credential: String {
    get { __data["credential"] }
    set { __data["credential"] = newValue }
  }

  public var expectedRevision: SafeInt {
    get { __data["expectedRevision"] }
    set { __data["expectedRevision"] = newValue }
  }

  public var profileId: ID {
    get { __data["profileId"] }
    set { __data["profileId"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
