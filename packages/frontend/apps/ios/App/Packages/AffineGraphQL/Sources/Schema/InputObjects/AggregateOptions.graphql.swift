// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AggregateOptions: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    hits: AggregateHitsOptions,
    pagination: GraphQLNullable<SearchPagination> = nil
  ) {
    __data = InputDict([
      "hits": hits,
      "pagination": pagination
    ])
  }

  public var hits: AggregateHitsOptions {
    get { __data["hits"] }
    set { __data["hits"] = newValue }
  }

  public var pagination: GraphQLNullable<SearchPagination> {
    get { __data["pagination"] }
    set { __data["pagination"] = newValue }
  }
}
