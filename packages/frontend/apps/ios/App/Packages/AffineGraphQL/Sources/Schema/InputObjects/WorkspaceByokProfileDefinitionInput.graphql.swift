// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokProfileDefinitionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    endpoint: WorkspaceByokEndpointInput,
    models: [WorkspaceByokModelDeclarationInput]
  ) {
    __data = InputDict([
      "endpoint": endpoint,
      "models": models
    ])
  }

  public var endpoint: WorkspaceByokEndpointInput {
    get { __data["endpoint"] }
    set { __data["endpoint"] = newValue }
  }

  public var models: [WorkspaceByokModelDeclarationInput] {
    get { __data["models"] }
    set { __data["models"] = newValue }
  }
}
