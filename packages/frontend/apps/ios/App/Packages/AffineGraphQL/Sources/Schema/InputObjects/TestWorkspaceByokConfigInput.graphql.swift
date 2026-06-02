// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct TestWorkspaceByokConfigInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    apiKey: GraphQLNullable<String> = nil,
    configId: GraphQLNullable<ID> = nil,
    endpoint: GraphQLNullable<String> = nil,
    provider: GraphQLEnum<ByokProvider>,
    storage: GraphQLEnum<ByokKeyStorage>,
    workspaceId: String
  ) {
    __data = InputDict([
      "apiKey": apiKey,
      "configId": configId,
      "endpoint": endpoint,
      "provider": provider,
      "storage": storage,
      "workspaceId": workspaceId
    ])
  }

  public var apiKey: GraphQLNullable<String> {
    get { __data["apiKey"] }
    set { __data["apiKey"] = newValue }
  }

  public var configId: GraphQLNullable<ID> {
    get { __data["configId"] }
    set { __data["configId"] = newValue }
  }

  public var endpoint: GraphQLNullable<String> {
    get { __data["endpoint"] }
    set { __data["endpoint"] = newValue }
  }

  public var provider: GraphQLEnum<ByokProvider> {
    get { __data["provider"] }
    set { __data["provider"] = newValue }
  }

  public var storage: GraphQLEnum<ByokKeyStorage> {
    get { __data["storage"] }
    set { __data["storage"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
