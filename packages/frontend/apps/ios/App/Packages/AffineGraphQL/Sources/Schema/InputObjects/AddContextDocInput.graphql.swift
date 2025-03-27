// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AddContextDocInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    contextId: String,
    docId: String
  ) {
    __data = InputDict([
      "contextId": contextId,
      "docId": docId
    ])
  }

  public var contextId: String {
    get { __data["contextId"] }
    set { __data["contextId"] = newValue }
  }

  public var docId: String {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }
}
