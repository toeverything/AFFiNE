// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateChatSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    docId: GraphQLNullable<String> = nil,
    pinned: GraphQLNullable<Bool> = nil,
    promptName: String,
    reuseLatestChat: GraphQLNullable<Bool> = nil,
    workspaceId: String
  ) {
    __data = InputDict([
      "docId": docId,
      "pinned": pinned,
      "promptName": promptName,
      "reuseLatestChat": reuseLatestChat,
      "workspaceId": workspaceId
    ])
  }

  public var docId: GraphQLNullable<String> {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  public var pinned: GraphQLNullable<Bool> {
    get { __data["pinned"] }
    set { __data["pinned"] = newValue }
  }

  /// The prompt name to use for the session
  public var promptName: String {
    get { __data["promptName"] }
    set { __data["promptName"] = newValue }
  }

  /// true by default, compliant for old version
  public var reuseLatestChat: GraphQLNullable<Bool> {
    get { __data["reuseLatestChat"] }
    set { __data["reuseLatestChat"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
