// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ProbeWorkspaceByokProfileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    checks: [WorkspaceByokProbeCheckInput],
    profileId: ID,
    workspaceId: String
  ) {
    __data = InputDict([
      "checks": checks,
      "profileId": profileId,
      "workspaceId": workspaceId
    ])
  }

  public var checks: [WorkspaceByokProbeCheckInput] {
    get { __data["checks"] }
    set { __data["checks"] = newValue }
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
