// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ReplaceWorkspaceByokProfileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    definition: WorkspaceByokProfileDefinitionInput,
    description: GraphQLNullable<String> = nil,
    enabled: Bool,
    name: String,
    profileId: ID,
    workspaceId: String
  ) {
    __data = InputDict([
      "definition": definition,
      "description": description,
      "enabled": enabled,
      "name": name,
      "profileId": profileId,
      "workspaceId": workspaceId
    ])
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

  public var profileId: ID {
    get { __data["profileId"] }
    set { __data["profileId"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
