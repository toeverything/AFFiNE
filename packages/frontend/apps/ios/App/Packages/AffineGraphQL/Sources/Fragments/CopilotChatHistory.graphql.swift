// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct CopilotChatHistory: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment CopilotChatHistory on CopilotHistories { __typename sessionId workspaceId docId parentSessionId promptName model optionalModels action pinned title tokens messages { __typename ...CopilotChatMessage } createdAt updatedAt }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistories }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("sessionId", String.self),
    .field("workspaceId", String.self),
    .field("docId", String?.self),
    .field("parentSessionId", String?.self),
    .field("promptName", String.self),
    .field("model", String.self),
    .field("optionalModels", [String].self),
    .field("action", String?.self),
    .field("pinned", Bool.self),
    .field("title", String?.self),
    .field("tokens", Int.self),
    .field("messages", [Message].self),
    .field("createdAt", AffineGraphQL.DateTime.self),
    .field("updatedAt", AffineGraphQL.DateTime.self),
  ] }

  public var sessionId: String { __data["sessionId"] }
  public var workspaceId: String { __data["workspaceId"] }
  public var docId: String? { __data["docId"] }
  public var parentSessionId: String? { __data["parentSessionId"] }
  public var promptName: String { __data["promptName"] }
  public var model: String { __data["model"] }
  public var optionalModels: [String] { __data["optionalModels"] }
  /// An mark identifying which view to use to display the session
  public var action: String? { __data["action"] }
  public var pinned: Bool { __data["pinned"] }
  public var title: String? { __data["title"] }
  /// The number of tokens used in the session
  public var tokens: Int { __data["tokens"] }
  public var messages: [Message] { __data["messages"] }
  public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
  public var updatedAt: AffineGraphQL.DateTime { __data["updatedAt"] }

  /// Message
  ///
  /// Parent Type: `ChatMessage`
  public struct Message: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ChatMessage }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .fragment(CopilotChatMessage.self),
    ] }

    public var id: AffineGraphQL.ID? { __data["id"] }
    public var role: String { __data["role"] }
    public var content: String { __data["content"] }
    public var attachments: [String]? { __data["attachments"] }
    public var streamObjects: [StreamObject]? { __data["streamObjects"] }
    public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }

    public struct Fragments: FragmentContainer {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public var copilotChatMessage: CopilotChatMessage { _toFragment() }
    }

    public typealias StreamObject = CopilotChatMessage.StreamObject
  }
}
