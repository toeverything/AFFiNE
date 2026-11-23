// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ReorderWorkspaceByokProfilesInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    profiles: [WorkspaceByokProfileOrderInput],
    workspaceId: String
  ) {
    __data = InputDict([
      "profiles": profiles,
      "workspaceId": workspaceId
    ])
  }

  public var profiles: [WorkspaceByokProfileOrderInput] {
    get { __data["profiles"] }
    set { __data["profiles"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
