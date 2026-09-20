// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ProbeWorkspaceByokDraftInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    checks: [WorkspaceByokProbeCheckInput],
    credential: GraphQLNullable<String> = nil,
    definition: WorkspaceByokProfileDefinitionInput,
    expectedRevision: GraphQLNullable<SafeInt> = nil,
    profileId: GraphQLNullable<ID> = nil,
    provider: GraphQLEnum<ByokProvider>,
    workspaceId: String
  ) {
    __data = InputDict([
      "checks": checks,
      "credential": credential,
      "definition": definition,
      "expectedRevision": expectedRevision,
      "profileId": profileId,
      "provider": provider,
      "workspaceId": workspaceId
    ])
  }

  public var checks: [WorkspaceByokProbeCheckInput] {
    get { __data["checks"] }
    set { __data["checks"] = newValue }
  }

  public var credential: GraphQLNullable<String> {
    get { __data["credential"] }
    set { __data["credential"] = newValue }
  }

  public var definition: WorkspaceByokProfileDefinitionInput {
    get { __data["definition"] }
    set { __data["definition"] = newValue }
  }

  public var expectedRevision: GraphQLNullable<SafeInt> {
    get { __data["expectedRevision"] }
    set { __data["expectedRevision"] = newValue }
  }

  public var profileId: GraphQLNullable<ID> {
    get { __data["profileId"] }
    set { __data["profileId"] = newValue }
  }

  public var provider: GraphQLEnum<ByokProvider> {
    get { __data["provider"] }
    set { __data["provider"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
