// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateWorkspaceCalendarsMutation: GraphQLMutation {
  public static let operationName: String = "updateWorkspaceCalendars"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateWorkspaceCalendars($input: UpdateWorkspaceCalendarsInput!) { updateWorkspaceCalendars(input: $input) { __typename id workspaceId createdByUserId displayNameOverride colorOverride enabled items { __typename id subscriptionId sortOrder colorOverride enabled } } }"#
    ))

  public var input: UpdateWorkspaceCalendarsInput

  public init(input: UpdateWorkspaceCalendarsInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateWorkspaceCalendars", UpdateWorkspaceCalendars.self, arguments: ["input": .variable("input")]),
    ] }

    public var updateWorkspaceCalendars: UpdateWorkspaceCalendars { __data["updateWorkspaceCalendars"] }

    /// UpdateWorkspaceCalendars
    ///
    /// Parent Type: `WorkspaceCalendarObjectType`
    public struct UpdateWorkspaceCalendars: AffineGraphQL.SelectionSet {
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

      /// UpdateWorkspaceCalendars.Item
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
