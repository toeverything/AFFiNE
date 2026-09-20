// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateWorkspaceByokLocalLeaseInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    providers: [CreateWorkspaceByokLocalLeaseProviderInput],
    workspaceId: String
  ) {
    __data = InputDict([
      "providers": providers,
      "workspaceId": workspaceId
    ])
  }

  public var providers: [CreateWorkspaceByokLocalLeaseProviderInput] {
    get { __data["providers"] }
    set { __data["providers"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
