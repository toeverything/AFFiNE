// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ForkChatSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    docId: String,
    latestMessageId: GraphQLNullable<String> = nil,
    sessionId: String,
    workspaceId: String
  ) {
    __data = InputDict([
      "docId": docId,
      "latestMessageId": latestMessageId,
      "sessionId": sessionId,
      "workspaceId": workspaceId
    ])
  }

  public var docId: String {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  /// Identify a message in the array and keep it with all previous messages into a forked session.
  public var latestMessageId: GraphQLNullable<String> {
    get { __data["latestMessageId"] }
    set { __data["latestMessageId"] = newValue }
  }

  public var sessionId: String {
    get { __data["sessionId"] }
    set { __data["sessionId"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
