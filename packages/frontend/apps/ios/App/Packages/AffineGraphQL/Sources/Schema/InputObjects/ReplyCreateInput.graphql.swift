// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ReplyCreateInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    commentId: ID,
    content: JSONObject,
    docMode: GraphQLEnum<DocMode>,
    docTitle: String,
    mentions: GraphQLNullable<[String]> = nil
  ) {
    __data = InputDict([
      "commentId": commentId,
      "content": content,
      "docMode": docMode,
      "docTitle": docTitle,
      "mentions": mentions
    ])
  }

  public var commentId: ID {
    get { __data["commentId"] }
    set { __data["commentId"] = newValue }
  }

  public var content: JSONObject {
    get { __data["content"] }
    set { __data["content"] = newValue }
  }

  public var docMode: GraphQLEnum<DocMode> {
    get { __data["docMode"] }
    set { __data["docMode"] = newValue }
  }

  public var docTitle: String {
    get { __data["docTitle"] }
    set { __data["docTitle"] = newValue }
  }

  /// The mention user ids, if not provided, the comment reply will not be mentioned
  public var mentions: GraphQLNullable<[String]> {
    get { __data["mentions"] }
    set { __data["mentions"] = newValue }
  }
}
