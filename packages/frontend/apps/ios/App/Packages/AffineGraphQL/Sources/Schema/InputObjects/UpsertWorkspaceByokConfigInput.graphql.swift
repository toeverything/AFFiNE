// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpsertWorkspaceByokConfigInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    apiKey: GraphQLNullable<String> = nil,
    description: GraphQLNullable<String> = nil,
    enabled: GraphQLNullable<Bool> = nil,
    endpoint: GraphQLNullable<String> = nil,
    id: GraphQLNullable<ID> = nil,
    name: String,
    provider: GraphQLEnum<ByokProvider>,
    sortOrder: GraphQLNullable<SafeInt> = nil,
    storage: GraphQLEnum<ByokKeyStorage>,
    workspaceId: String
  ) {
    __data = InputDict([
      "apiKey": apiKey,
      "description": description,
      "enabled": enabled,
      "endpoint": endpoint,
      "id": id,
      "name": name,
      "provider": provider,
      "sortOrder": sortOrder,
      "storage": storage,
      "workspaceId": workspaceId
    ])
  }

  public var apiKey: GraphQLNullable<String> {
    get { __data["apiKey"] }
    set { __data["apiKey"] = newValue }
  }

  public var description: GraphQLNullable<String> {
    get { __data["description"] }
    set { __data["description"] = newValue }
  }

  public var enabled: GraphQLNullable<Bool> {
    get { __data["enabled"] }
    set { __data["enabled"] = newValue }
  }

  public var endpoint: GraphQLNullable<String> {
    get { __data["endpoint"] }
    set { __data["endpoint"] = newValue }
  }

  public var id: GraphQLNullable<ID> {
    get { __data["id"] }
    set { __data["id"] = newValue }
  }

  public var name: String {
    get { __data["name"] }
    set { __data["name"] = newValue }
  }

  public var provider: GraphQLEnum<ByokProvider> {
    get { __data["provider"] }
    set { __data["provider"] = newValue }
  }

  public var sortOrder: GraphQLNullable<SafeInt> {
    get { __data["sortOrder"] }
    set { __data["sortOrder"] = newValue }
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
