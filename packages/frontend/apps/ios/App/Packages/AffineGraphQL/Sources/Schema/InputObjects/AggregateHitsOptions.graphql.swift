// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AggregateHitsOptions: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    fields: [String],
    highlights: GraphQLNullable<[SearchHighlight]> = nil,
    pagination: GraphQLNullable<AggregateHitsPagination> = nil
  ) {
    __data = InputDict([
      "fields": fields,
      "highlights": highlights,
      "pagination": pagination
    ])
  }

  public var fields: [String] {
    get { __data["fields"] }
    set { __data["fields"] = newValue }
  }

  public var highlights: GraphQLNullable<[SearchHighlight]> {
    get { __data["highlights"] }
    set { __data["highlights"] = newValue }
  }

  public var pagination: GraphQLNullable<AggregateHitsPagination> {
    get { __data["pagination"] }
    set { __data["pagination"] = newValue }
  }
}
