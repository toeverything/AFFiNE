// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ListWorkspaceInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    enableAi: GraphQLNullable<Bool> = nil,
    enableDocEmbedding: GraphQLNullable<Bool> = nil,
    enableSharing: GraphQLNullable<Bool> = nil,
    enableUrlPreview: GraphQLNullable<Bool> = nil,
    features: GraphQLNullable<[GraphQLEnum<FeatureType>]> = nil,
    first: Int? = nil,
    keyword: GraphQLNullable<String> = nil,
    orderBy: GraphQLNullable<GraphQLEnum<AdminWorkspaceSort>> = nil,
    `public`: GraphQLNullable<Bool> = nil,
    skip: Int? = nil
  ) {
    __data = InputDict([
      "enableAi": enableAi,
      "enableDocEmbedding": enableDocEmbedding,
      "enableSharing": enableSharing,
      "enableUrlPreview": enableUrlPreview,
      "features": features,
      "first": first,
      "keyword": keyword,
      "orderBy": orderBy,
      "public": `public`,
      "skip": skip
    ])
  }

  public var enableAi: GraphQLNullable<Bool> {
    get { __data["enableAi"] }
    set { __data["enableAi"] = newValue }
  }

  public var enableDocEmbedding: GraphQLNullable<Bool> {
    get { __data["enableDocEmbedding"] }
    set { __data["enableDocEmbedding"] = newValue }
  }

  public var enableSharing: GraphQLNullable<Bool> {
    get { __data["enableSharing"] }
    set { __data["enableSharing"] = newValue }
  }

  public var enableUrlPreview: GraphQLNullable<Bool> {
    get { __data["enableUrlPreview"] }
    set { __data["enableUrlPreview"] = newValue }
  }

  public var features: GraphQLNullable<[GraphQLEnum<FeatureType>]> {
    get { __data["features"] }
    set { __data["features"] = newValue }
  }

  public var first: Int? {
    get { __data["first"] }
    set { __data["first"] = newValue }
  }

  public var keyword: GraphQLNullable<String> {
    get { __data["keyword"] }
    set { __data["keyword"] = newValue }
  }

  public var orderBy: GraphQLNullable<GraphQLEnum<AdminWorkspaceSort>> {
    get { __data["orderBy"] }
    set { __data["orderBy"] = newValue }
  }

  public var `public`: GraphQLNullable<Bool> {
    get { __data["public"] }
    set { __data["public"] = newValue }
  }

  public var skip: Int? {
    get { __data["skip"] }
    set { __data["skip"] = newValue }
  }
}
