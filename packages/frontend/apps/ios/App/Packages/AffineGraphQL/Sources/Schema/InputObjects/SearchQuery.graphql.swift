// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SearchQuery: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    boost: GraphQLNullable<Double> = nil,
    field: GraphQLNullable<String> = nil,
    match: GraphQLNullable<String> = nil,
    occur: GraphQLNullable<GraphQLEnum<SearchQueryOccur>> = nil,
    queries: GraphQLNullable<[SearchQuery]> = nil,
    query: GraphQLNullable<SearchQuery> = nil,
    type: GraphQLEnum<SearchQueryType>
  ) {
    __data = InputDict([
      "boost": boost,
      "field": field,
      "match": match,
      "occur": occur,
      "queries": queries,
      "query": query,
      "type": type
    ])
  }

  public var boost: GraphQLNullable<Double> {
    get { __data["boost"] }
    set { __data["boost"] = newValue }
  }

  public var field: GraphQLNullable<String> {
    get { __data["field"] }
    set { __data["field"] = newValue }
  }

  public var match: GraphQLNullable<String> {
    get { __data["match"] }
    set { __data["match"] = newValue }
  }

  public var occur: GraphQLNullable<GraphQLEnum<SearchQueryOccur>> {
    get { __data["occur"] }
    set { __data["occur"] = newValue }
  }

  public var queries: GraphQLNullable<[SearchQuery]> {
    get { __data["queries"] }
    set { __data["queries"] = newValue }
  }

  public var query: GraphQLNullable<SearchQuery> {
    get { __data["query"] }
    set { __data["query"] = newValue }
  }

  public var type: GraphQLEnum<SearchQueryType> {
    get { __data["type"] }
    set { __data["type"] = newValue }
  }
}
