// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct PaginationInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    after: GraphQLNullable<String> = nil,
    first: GraphQLNullable<Int> = nil,
    offset: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "after": after,
      "first": first,
      "offset": offset
    ])
  }

  /// returns the elements in the list that come after the specified cursor.
  public var after: GraphQLNullable<String> {
    get { __data["after"] }
    set { __data["after"] = newValue }
  }

  /// returns the first n elements from the list.
  public var first: GraphQLNullable<Int> {
    get { __data["first"] }
    set { __data["first"] = newValue }
  }

  /// ignore the first n elements from the list.
  public var offset: GraphQLNullable<Int> {
    get { __data["offset"] }
    set { __data["offset"] = newValue }
  }
}
