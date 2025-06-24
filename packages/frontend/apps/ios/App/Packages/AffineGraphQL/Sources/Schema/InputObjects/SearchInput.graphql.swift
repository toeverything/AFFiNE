// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SearchInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    options: SearchOptions,
    query: SearchQuery,
    table: GraphQLEnum<SearchTable>
  ) {
    __data = InputDict([
      "options": options,
      "query": query,
      "table": table
    ])
  }

  public var options: SearchOptions {
    get { __data["options"] }
    set { __data["options"] = newValue }
  }

  public var query: SearchQuery {
    get { __data["query"] }
    set { __data["query"] = newValue }
  }

  public var table: GraphQLEnum<SearchTable> {
    get { __data["table"] }
    set { __data["table"] = newValue }
  }
}
