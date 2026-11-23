// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateWorkspaceByokLocalLeaseProviderInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    credential: String,
    definition: WorkspaceByokProfileDefinitionInput,
    description: GraphQLNullable<String> = nil,
    enabled: Bool,
    name: String,
    provider: GraphQLEnum<ByokProvider>
  ) {
    __data = InputDict([
      "credential": credential,
      "definition": definition,
      "description": description,
      "enabled": enabled,
      "name": name,
      "provider": provider
    ])
  }

  public var credential: String {
    get { __data["credential"] }
    set { __data["credential"] = newValue }
  }

  public var definition: WorkspaceByokProfileDefinitionInput {
    get { __data["definition"] }
    set { __data["definition"] = newValue }
  }

  public var description: GraphQLNullable<String> {
    get { __data["description"] }
    set { __data["description"] = newValue }
  }

  public var enabled: Bool {
    get { __data["enabled"] }
    set { __data["enabled"] = newValue }
  }

  public var name: String {
    get { __data["name"] }
    set { __data["name"] = newValue }
  }

  public var provider: GraphQLEnum<ByokProvider> {
    get { __data["provider"] }
    set { __data["provider"] = newValue }
  }
}
