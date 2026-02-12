// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ListUserInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    features: GraphQLNullable<[GraphQLEnum<FeatureType>]> = nil,
    first: GraphQLNullable<Int> = nil,
    keyword: GraphQLNullable<String> = nil,
    skip: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "features": features,
      "first": first,
      "keyword": keyword,
      "skip": skip
    ])
  }

  public var features: GraphQLNullable<[GraphQLEnum<FeatureType>]> {
    get { __data["features"] }
    set { __data["features"] = newValue }
  }

  public var first: GraphQLNullable<Int> {
    get { __data["first"] }
    set { __data["first"] = newValue }
  }

  public var keyword: GraphQLNullable<String> {
    get { __data["keyword"] }
    set { __data["keyword"] = newValue }
  }

  public var skip: GraphQLNullable<Int> {
    get { __data["skip"] }
    set { __data["skip"] = newValue }
  }
}
