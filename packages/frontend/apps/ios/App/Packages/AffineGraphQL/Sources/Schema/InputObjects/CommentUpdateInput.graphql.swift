// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CommentUpdateInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    content: JSONObject,
    id: ID
  ) {
    __data = InputDict([
      "content": content,
      "id": id
    ])
  }

  public var content: JSONObject {
    get { __data["content"] }
    set { __data["content"] = newValue }
  }

  public var id: ID {
    get { __data["id"] }
    set { __data["id"] = newValue }
  }
}
