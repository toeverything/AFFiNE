// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct GenerateAccessTokenInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    expiresAt: GraphQLNullable<DateTime> = nil,
    name: String
  ) {
    __data = InputDict([
      "expiresAt": expiresAt,
      "name": name
    ])
  }

  public var expiresAt: GraphQLNullable<DateTime> {
    get { __data["expiresAt"] }
    set { __data["expiresAt"] = newValue }
  }

  public var name: String {
    get { __data["name"] }
    set { __data["name"] = newValue }
  }
}
