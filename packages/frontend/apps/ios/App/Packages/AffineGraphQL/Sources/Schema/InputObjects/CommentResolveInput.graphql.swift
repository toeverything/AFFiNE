// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CommentResolveInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    id: ID,
    resolved: Bool
  ) {
    __data = InputDict([
      "id": id,
      "resolved": resolved
    ])
  }

  public var id: ID {
    get { __data["id"] }
    set { __data["id"] = newValue }
  }

  /// Whether the comment is resolved
  public var resolved: Bool {
    get { __data["resolved"] }
    set { __data["resolved"] = newValue }
  }
}
