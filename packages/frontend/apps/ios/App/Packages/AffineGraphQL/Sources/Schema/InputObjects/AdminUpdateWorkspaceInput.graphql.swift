// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AdminUpdateWorkspaceInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    avatarKey: GraphQLNullable<String> = nil,
    enableAi: GraphQLNullable<Bool> = nil,
    enableDocEmbedding: GraphQLNullable<Bool> = nil,
    enableSharing: GraphQLNullable<Bool> = nil,
    enableUrlPreview: GraphQLNullable<Bool> = nil,
    features: GraphQLNullable<[GraphQLEnum<FeatureType>]> = nil,
    id: String,
    name: GraphQLNullable<String> = nil,
    `public`: GraphQLNullable<Bool> = nil
  ) {
    __data = InputDict([
      "avatarKey": avatarKey,
      "enableAi": enableAi,
      "enableDocEmbedding": enableDocEmbedding,
      "enableSharing": enableSharing,
      "enableUrlPreview": enableUrlPreview,
      "features": features,
      "id": id,
      "name": name,
      "public": `public`
    ])
  }

  public var avatarKey: GraphQLNullable<String> {
    get { __data["avatarKey"] }
    set { __data["avatarKey"] = newValue }
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

  public var id: String {
    get { __data["id"] }
    set { __data["id"] = newValue }
  }

  public var name: GraphQLNullable<String> {
    get { __data["name"] }
    set { __data["name"] = newValue }
  }

  public var `public`: GraphQLNullable<Bool> {
    get { __data["public"] }
    set { __data["public"] = newValue }
  }
}
