// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AggregateHitsPagination: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    limit: GraphQLNullable<Int> = nil,
    skip: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "limit": limit,
      "skip": skip
    ])
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
