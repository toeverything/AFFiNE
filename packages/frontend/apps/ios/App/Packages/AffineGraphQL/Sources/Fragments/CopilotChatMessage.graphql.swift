// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct CopilotChatMessage: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment CopilotChatMessage on ChatMessage { __typename id role content attachments streamObjects { __typename type textDelta toolCallId toolName args result } createdAt }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ChatMessage }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("id", AffineGraphQL.ID?.self),
    .field("role", String.self),
    .field("content", String.self),
    .field("attachments", [String]?.self),
    .field("streamObjects", [StreamObject]?.self),
    .field("createdAt", AffineGraphQL.DateTime.self),
  ] }

  public var id: AffineGraphQL.ID? { __data["id"] }
  public var role: String { __data["role"] }
  public var content: String { __data["content"] }
  public var attachments: [String]? { __data["attachments"] }
  public var streamObjects: [StreamObject]? { __data["streamObjects"] }
  public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }

  /// StreamObject
  ///
  /// Parent Type: `StreamObject`
  public struct StreamObject: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.StreamObject }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("type", String.self),
      .field("textDelta", String?.self),
      .field("toolCallId", String?.self),
      .field("toolName", String?.self),
      .field("args", AffineGraphQL.JSON?.self),
      .field("result", AffineGraphQL.JSON?.self),
    ] }

    public var type: String { __data["type"] }
    public var textDelta: String? { __data["textDelta"] }
    public var toolCallId: String? { __data["toolCallId"] }
    public var toolName: String? { __data["toolName"] }
    public var args: AffineGraphQL.JSON? { __data["args"] }
    public var result: AffineGraphQL.JSON? { __data["result"] }
  }
}
