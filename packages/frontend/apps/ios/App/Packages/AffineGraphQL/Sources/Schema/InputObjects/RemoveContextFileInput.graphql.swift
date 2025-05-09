// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct RemoveContextFileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    contextId: String,
    fileId: String
  ) {
    __data = InputDict([
      "contextId": contextId,
      "fileId": fileId
    ])
  }

  public var contextId: String {
    get { __data["contextId"] }
    set { __data["contextId"] = newValue }
  }

  public var fileId: String {
    get { __data["fileId"] }
    set { __data["fileId"] = newValue }
  }
}
