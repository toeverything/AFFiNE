// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class WorkspaceCalendarsQuery: GraphQLQuery {
  public static let operationName: String = "workspaceCalendars"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query workspaceCalendars($workspaceId: String!) { workspace(id: $workspaceId) { __typename calendars { __typename id workspaceId createdByUserId displayNameOverride colorOverride enabled items { __typename id subscriptionId sortOrder colorOverride enabled } } } }"#
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("calendars", [Calendar].self),
      ] }

      public var calendars: [Calendar] { __data["calendars"] }

      /// Workspace.Calendar
      ///
      /// Parent Type: `WorkspaceCalendarObjectType`
      public struct Calendar: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceCalendarObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("id", String.self),
          .field("workspaceId", String.self),
          .field("createdByUserId", String.self),
          .field("displayNameOverride", String?.self),
          .field("colorOverride", String?.self),
          .field("enabled", Bool.self),
          .field("items", [Item].self),
        ] }

        public var id: String { __data["id"] }
        public var workspaceId: String { __data["workspaceId"] }
        public var createdByUserId: String { __data["createdByUserId"] }
        public var displayNameOverride: String? { __data["displayNameOverride"] }
        public var colorOverride: String? { __data["colorOverride"] }
        public var enabled: Bool { __data["enabled"] }
        public var items: [Item] { __data["items"] }

        /// Workspace.Calendar.Item
        ///
        /// Parent Type: `WorkspaceCalendarItemObjectType`
        public struct Item: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceCalendarItemObjectType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("id", String.self),
            .field("subscriptionId", String.self),
            .field("sortOrder", Int?.self),
            .field("colorOverride", String?.self),
            .field("enabled", Bool.self),
          ] }

          public var id: String { __data["id"] }
          public var subscriptionId: String { __data["subscriptionId"] }
          public var sortOrder: Int? { __data["sortOrder"] }
          public var colorOverride: String? { __data["colorOverride"] }
          public var enabled: Bool { __data["enabled"] }
        }
      }
    }
  }
}
