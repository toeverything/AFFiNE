// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CommentCreateInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    content: JSONObject,
    docId: ID,
    docMode: GraphQLEnum<DocMode>,
    docTitle: String,
    mentions: GraphQLNullable<[String]> = nil,
    workspaceId: ID
  ) {
    __data = InputDict([
      "content": content,
      "docId": docId,
      "docMode": docMode,
      "docTitle": docTitle,
      "mentions": mentions,
      "workspaceId": workspaceId
    ])
  }

  public var content: JSONObject {
    get { __data["content"] }
    set { __data["content"] = newValue }
  }

  public var docId: ID {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  public var docMode: GraphQLEnum<DocMode> {
    get { __data["docMode"] }
    set { __data["docMode"] = newValue }
  }

  public var docTitle: String {
    get { __data["docTitle"] }
    set { __data["docTitle"] = newValue }
  }

  /// The mention user ids, if not provided, the comment will not be mentioned
  public var mentions: GraphQLNullable<[String]> {
    get { __data["mentions"] }
    set { __data["mentions"] = newValue }
  }

  public var workspaceId: ID {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
