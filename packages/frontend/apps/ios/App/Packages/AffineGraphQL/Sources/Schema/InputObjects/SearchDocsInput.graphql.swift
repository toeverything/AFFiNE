// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SearchDocsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    keyword: String,
    limit: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "keyword": keyword,
      "limit": limit
    ])
  }

  public var keyword: String {
    get { __data["keyword"] }
    set { __data["keyword"] = newValue }
  }

  /// Limit the number of docs to return, default is 20
  public var limit: GraphQLNullable<Int> {
    get { __data["limit"] }
    set { __data["limit"] = newValue }
  }
}
