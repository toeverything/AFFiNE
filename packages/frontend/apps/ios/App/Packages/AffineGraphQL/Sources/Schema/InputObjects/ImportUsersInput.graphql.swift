// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ImportUsersInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    users: [CreateUserInput]
  ) {
    __data = InputDict([
      "users": users
    ])
  }

  public var users: [CreateUserInput] {
    get { __data["users"] }
    set { __data["users"] = newValue }
  }
}
