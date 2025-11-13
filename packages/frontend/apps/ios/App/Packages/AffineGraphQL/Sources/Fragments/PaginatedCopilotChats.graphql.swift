// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct PaginatedCopilotChats: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment PaginatedCopilotChats on PaginatedCopilotHistoriesType { __typename pageInfo { __typename hasNextPage hasPreviousPage startCursor endCursor } edges { __typename cursor node { __typename ...CopilotChatHistory } } }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PaginatedCopilotHistoriesType }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("pageInfo", PageInfo.self),
    .field("edges", [Edge].self),
  ] }

  public var pageInfo: PageInfo { __data["pageInfo"] }
  public var edges: [Edge] { __data["edges"] }

  /// PageInfo
  ///
  /// Parent Type: `PageInfo`
  public struct PageInfo: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PageInfo }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("hasNextPage", Bool.self),
      .field("hasPreviousPage", Bool.self),
      .field("startCursor", String?.self),
      .field("endCursor", String?.self),
    ] }

    public var hasNextPage: Bool { __data["hasNextPage"] }
    public var hasPreviousPage: Bool { __data["hasPreviousPage"] }
    public var startCursor: String? { __data["startCursor"] }
    public var endCursor: String? { __data["endCursor"] }
  }

  /// Edge
  ///
  /// Parent Type: `CopilotHistoriesTypeEdge`
  public struct Edge: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistoriesTypeEdge }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("__typename", String.self),
      .field("cursor", String.self),
      .field("node", Node.self),
    ] }

    public var cursor: String { __data["cursor"] }
    public var node: Node { __data["node"] }

    /// Edge.Node
    ///
    /// Parent Type: `CopilotHistories`
    public struct Node: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotHistories }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .fragment(CopilotChatHistory.self),
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

      public struct Fragments: FragmentContainer {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public var copilotChatHistory: CopilotChatHistory { _toFragment() }
      }

      public typealias Message = CopilotChatHistory.Message
    }
  }
}
