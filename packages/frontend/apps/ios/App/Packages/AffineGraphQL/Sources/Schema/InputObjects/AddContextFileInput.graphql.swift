// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AddContextFileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    contextId: String
  ) {
    __data = InputDict([
      "contextId": contextId
    ])
  }

  public var contextId: String {
    get { __data["contextId"] }
    set { __data["contextId"] = newValue }
  }
}
