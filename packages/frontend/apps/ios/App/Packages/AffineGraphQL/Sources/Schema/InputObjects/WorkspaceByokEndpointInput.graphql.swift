// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokEndpointInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    dialect: GraphQLNullable<GraphQLEnum<ByokOpenAiDialect>> = nil,
    kind: GraphQLEnum<ByokEndpointKind>,
    url: GraphQLNullable<String> = nil
  ) {
    __data = InputDict([
      "dialect": dialect,
      "kind": kind,
      "url": url
    ])
  }

  public var dialect: GraphQLNullable<GraphQLEnum<ByokOpenAiDialect>> {
    get { __data["dialect"] }
    set { __data["dialect"] = newValue }
  }

  public var kind: GraphQLEnum<ByokEndpointKind> {
    get { __data["kind"] }
    set { __data["kind"] = newValue }
  }

  public var url: GraphQLNullable<String> {
    get { __data["url"] }
    set { __data["url"] = newValue }
  }
}
