// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateMcpCredentialInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    accessMode: GraphQLEnum<McpAccessMode>? = nil,
    expirationDays: Int? = nil,
    name: String,
    workspaceId: String
  ) {
    __data = InputDict([
      "accessMode": accessMode,
      "expirationDays": expirationDays,
      "name": name,
      "workspaceId": workspaceId
    ])
  }

  public var accessMode: GraphQLEnum<McpAccessMode>? {
    get { __data["accessMode"] }
    set { __data["accessMode"] = newValue }
  }

  public var expirationDays: Int? {
    get { __data["expirationDays"] }
    set { __data["expirationDays"] = newValue }
  }

  public var name: String {
    get { __data["name"] }
    set { __data["name"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
