// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateWorkspaceByokLocalLeaseProviderInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    apiKey: String,
    description: GraphQLNullable<String> = nil,
    enabled: GraphQLNullable<Bool> = nil,
    endpoint: GraphQLNullable<String> = nil,
    name: String,
    provider: GraphQLEnum<ByokProvider>,
    sortOrder: GraphQLNullable<SafeInt> = nil
  ) {
    __data = InputDict([
      "apiKey": apiKey,
      "description": description,
      "enabled": enabled,
      "endpoint": endpoint,
      "name": name,
      "provider": provider,
      "sortOrder": sortOrder
    ])
  }

  public var apiKey: String {
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
}
