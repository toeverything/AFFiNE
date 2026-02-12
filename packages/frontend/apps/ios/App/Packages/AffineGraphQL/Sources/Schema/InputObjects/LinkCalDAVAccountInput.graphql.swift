// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct LinkCalDAVAccountInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    displayName: GraphQLNullable<String> = nil,
    password: String,
    providerPresetId: String,
    username: String
  ) {
    __data = InputDict([
      "displayName": displayName,
      "password": password,
      "providerPresetId": providerPresetId,
      "username": username
    ])
  }

  public var displayName: GraphQLNullable<String> {
    get { __data["displayName"] }
    set { __data["displayName"] = newValue }
  }

  public var password: String {
    get { __data["password"] }
    set { __data["password"] = newValue }
  }

  public var providerPresetId: String {
    get { __data["providerPresetId"] }
    set { __data["providerPresetId"] = newValue }
  }

  public var username: String {
    get { __data["username"] }
    set { __data["username"] = newValue }
  }
}
