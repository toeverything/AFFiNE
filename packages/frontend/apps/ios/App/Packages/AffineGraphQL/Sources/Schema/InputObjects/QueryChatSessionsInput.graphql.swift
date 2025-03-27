// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct QueryChatSessionsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    action: GraphQLNullable<Bool> = nil
  ) {
    __data = InputDict([
      "action": action
    ])
  }

  public var action: GraphQLNullable<Bool> {
    get { __data["action"] }
    set { __data["action"] = newValue }
  }
}
