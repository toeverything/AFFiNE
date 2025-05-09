// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateChatSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    promptName: String,
    sessionId: String
  ) {
    __data = InputDict([
      "promptName": promptName,
      "sessionId": sessionId
    ])
  }

  /// The prompt name to use for the session
  public var promptName: String {
    get { __data["promptName"] }
    set { __data["promptName"] = newValue }
  }

  public var sessionId: String {
    get { __data["sessionId"] }
    set { __data["sessionId"] = newValue }
  }
}
