// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ReplaceWorkspaceByokProfileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    credential: GraphQLNullable<String> = nil,
    definition: WorkspaceByokProfileDefinitionInput,
    description: GraphQLNullable<String> = nil,
    enabled: Bool,
    expectedRevision: SafeInt,
    name: String,
    profileId: ID,
    workspaceId: String
  ) {
    __data = InputDict([
      "credential": credential,
      "definition": definition,
      "description": description,
      "enabled": enabled,
      "expectedRevision": expectedRevision,
      "name": name,
      "profileId": profileId,
      "workspaceId": workspaceId
    ])
  }

  public var credential: GraphQLNullable<String> {
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

  public var expectedRevision: SafeInt {
    get { __data["expectedRevision"] }
    set { __data["expectedRevision"] = newValue }
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
