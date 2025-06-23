// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateChatSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    docId: GraphQLNullable<String> = nil,
    pinned: GraphQLNullable<Bool> = nil,
    promptName: GraphQLNullable<String> = nil,
    sessionId: String
  ) {
    __data = InputDict([
      "docId": docId,
      "pinned": pinned,
      "promptName": promptName,
      "sessionId": sessionId
    ])
  }

  /// The workspace id of the session
  public var docId: GraphQLNullable<String> {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  /// Whether to pin the session
  public var pinned: GraphQLNullable<Bool> {
    get { __data["pinned"] }
    set { __data["pinned"] = newValue }
  }

  /// The prompt name to use for the session
  public var promptName: GraphQLNullable<String> {
    get { __data["promptName"] }
    set { __data["promptName"] = newValue }
  }

  public var sessionId: String {
    get { __data["sessionId"] }
    set { __data["sessionId"] = newValue }
  }
}
