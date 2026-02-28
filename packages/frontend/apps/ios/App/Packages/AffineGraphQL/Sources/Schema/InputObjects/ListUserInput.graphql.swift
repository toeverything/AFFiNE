// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ListUserInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    first: GraphQLNullable<Int> = nil,
    skip: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "first": first,
      "skip": skip
    ])
  }

  public var first: GraphQLNullable<Int> {
    get { __data["first"] }
    set { __data["first"] = newValue }
  }

  public var skip: GraphQLNullable<Int> {
    get { __data["skip"] }
    set { __data["skip"] = newValue }
  }
}
