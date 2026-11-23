// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct MentionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    doc: MentionDocInput,
    userId: String,
    workspaceId: String
  ) {
    __data = InputDict([
      "doc": doc,
      "userId": userId,
      "workspaceId": workspaceId
    ])
  }

  public var doc: MentionDocInput {
    get { __data["doc"] }
    set { __data["doc"] = newValue }
  }

  public var userId: String {
    get { __data["userId"] }
    set { __data["userId"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
