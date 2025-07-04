// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct QueryChatSessionsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    action: GraphQLNullable<Bool> = nil,
    fork: GraphQLNullable<Bool> = nil,
    limit: GraphQLNullable<Int> = nil,
    pinned: GraphQLNullable<Bool> = nil,
    skip: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "action": action,
      "fork": fork,
      "limit": limit,
      "pinned": pinned,
      "skip": skip
    ])
  }

  public var action: GraphQLNullable<Bool> {
    get { __data["action"] }
    set { __data["action"] = newValue }
  }

  public var fork: GraphQLNullable<Bool> {
    get { __data["fork"] }
    set { __data["fork"] = newValue }
  }

  public var limit: GraphQLNullable<Int> {
    get { __data["limit"] }
    set { __data["limit"] = newValue }
  }

  public var pinned: GraphQLNullable<Bool> {
    get { __data["pinned"] }
    set { __data["pinned"] = newValue }
  }

  public var skip: GraphQLNullable<Int> {
    get { __data["skip"] }
    set { __data["skip"] = newValue }
  }
}
