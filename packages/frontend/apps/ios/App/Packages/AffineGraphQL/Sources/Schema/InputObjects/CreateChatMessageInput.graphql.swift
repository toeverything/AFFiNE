// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateChatMessageInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    attachments: GraphQLNullable<[String]> = nil,
    blob: GraphQLNullable<Upload> = nil,
    blobs: GraphQLNullable<[Upload]> = nil,
    content: GraphQLNullable<String> = nil,
    params: GraphQLNullable<JSON> = nil,
    sessionId: String
  ) {
    __data = InputDict([
      "attachments": attachments,
      "blob": blob,
      "blobs": blobs,
      "content": content,
      "params": params,
      "sessionId": sessionId
    ])
  }

  public var attachments: GraphQLNullable<[String]> {
    get { __data["attachments"] }
    set { __data["attachments"] = newValue }
  }

  public var blob: GraphQLNullable<Upload> {
    get { __data["blob"] }
    set { __data["blob"] = newValue }
  }

  public var blobs: GraphQLNullable<[Upload]> {
    get { __data["blobs"] }
    set { __data["blobs"] = newValue }
  }

  public var content: GraphQLNullable<String> {
    get { __data["content"] }
    set { __data["content"] = newValue }
  }

  public var params: GraphQLNullable<JSON> {
    get { __data["params"] }
    set { __data["params"] = newValue }
  }

  public var sessionId: String {
    get { __data["sessionId"] }
    set { __data["sessionId"] = newValue }
  }
}
