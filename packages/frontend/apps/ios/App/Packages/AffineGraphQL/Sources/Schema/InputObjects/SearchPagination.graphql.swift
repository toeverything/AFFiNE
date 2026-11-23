// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SearchPagination: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    cursor: GraphQLNullable<String> = nil,
    limit: GraphQLNullable<Int> = nil,
    skip: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "cursor": cursor,
      "limit": limit,
      "skip": skip
    ])
  }

  public var cursor: GraphQLNullable<String> {
    get { __data["cursor"] }
    set { __data["cursor"] = newValue }
  }

  public var limit: GraphQLNullable<Int> {
    get { __data["limit"] }
    set { __data["limit"] = newValue }
  }

  public var skip: GraphQLNullable<Int> {
    get { __data["skip"] }
    set { __data["skip"] = newValue }
  }
}
