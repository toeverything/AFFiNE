// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct MentionDocInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    blockId: GraphQLNullable<String> = nil,
    elementId: GraphQLNullable<String> = nil,
    id: String,
    mode: GraphQLEnum<DocMode>,
    title: String
  ) {
    __data = InputDict([
      "blockId": blockId,
      "elementId": elementId,
      "id": id,
      "mode": mode,
      "title": title
    ])
  }

  /// The block id in the doc
  public var blockId: GraphQLNullable<String> {
    get { __data["blockId"] }
    set { __data["blockId"] = newValue }
  }

  /// The element id in the doc
  public var elementId: GraphQLNullable<String> {
    get { __data["elementId"] }
    set { __data["elementId"] = newValue }
  }

  public var id: String {
    get { __data["id"] }
    set { __data["id"] = newValue }
  }

  public var mode: GraphQLEnum<DocMode> {
    get { __data["mode"] }
    set { __data["mode"] = newValue }
  }

  public var title: String {
    get { __data["title"] }
    set { __data["title"] = newValue }
  }
}
