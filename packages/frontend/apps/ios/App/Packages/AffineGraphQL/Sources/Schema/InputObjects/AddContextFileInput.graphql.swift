// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AddContextFileInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    blobId: GraphQLNullable<String> = nil,
    contextId: String
  ) {
    __data = InputDict([
      "blobId": blobId,
      "contextId": contextId
    ])
  }

  public var blobId: GraphQLNullable<String> {
    get { __data["blobId"] }
    set { __data["blobId"] = newValue }
  }

  public var contextId: String {
    get { __data["contextId"] }
    set { __data["contextId"] = newValue }
  }
}
