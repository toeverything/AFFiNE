// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokEndpointInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    kind: String,
    url: GraphQLNullable<String> = nil
  ) {
    __data = InputDict([
      "kind": kind,
      "url": url
    ])
  }

  public var kind: String {
    get { __data["kind"] }
    set { __data["kind"] = newValue }
  }

  public var url: GraphQLNullable<String> {
    get { __data["url"] }
    set { __data["url"] = newValue }
  }
}
