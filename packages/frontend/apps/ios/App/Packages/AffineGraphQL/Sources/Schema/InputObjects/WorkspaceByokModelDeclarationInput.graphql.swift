// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokModelDeclarationInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    capabilities: [WorkspaceByokCapabilityInput],
    enabled: Bool,
    modelId: String
  ) {
    __data = InputDict([
      "capabilities": capabilities,
      "enabled": enabled,
      "modelId": modelId
    ])
  }

  public var capabilities: [WorkspaceByokCapabilityInput] {
    get { __data["capabilities"] }
    set { __data["capabilities"] = newValue }
  }

  public var enabled: Bool {
    get { __data["enabled"] }
    set { __data["enabled"] = newValue }
  }

  public var modelId: String {
    get { __data["modelId"] }
    set { __data["modelId"] = newValue }
  }
}
