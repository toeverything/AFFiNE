// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CalendarEventsQuery: GraphQLQuery {
  public static let operationName: String = "calendarEvents"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query calendarEvents($workspaceId: String!, $from: DateTime!, $to: DateTime!) { workspace(id: $workspaceId) { __typename calendars { __typename id events(from: $from, to: $to) { __typename id subscriptionId externalEventId recurrenceId status title description location startAtUtc endAtUtc originalTimezone allDay } } } }"#
    ))

  public var workspaceId: String
  public var from: DateTime
  public var to: DateTime

  public init(
    workspaceId: String,
    from: DateTime,
    to: DateTime
  ) {
    self.workspaceId = workspaceId
    self.from = from
    self.to = to
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "from": from,
    "to": to
  ] }

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
          .field("events", [Event].self, arguments: [
            "from": .variable("from"),
            "to": .variable("to")
          ]),
        ] }

        public var id: String { __data["id"] }
        public var events: [Event] { __data["events"] }

        /// Workspace.Calendar.Event
        ///
        /// Parent Type: `CalendarEventObjectType`
        public struct Event: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CalendarEventObjectType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("id", String.self),
            .field("subscriptionId", String.self),
            .field("externalEventId", String.self),
            .field("recurrenceId", String?.self),
            .field("status", String?.self),
            .field("title", String?.self),
            .field("description", String?.self),
            .field("location", String?.self),
            .field("startAtUtc", AffineGraphQL.DateTime.self),
            .field("endAtUtc", AffineGraphQL.DateTime.self),
            .field("originalTimezone", String?.self),
            .field("allDay", Bool.self),
          ] }

          public var id: String { __data["id"] }
          public var subscriptionId: String { __data["subscriptionId"] }
          public var externalEventId: String { __data["externalEventId"] }
          public var recurrenceId: String? { __data["recurrenceId"] }
          public var status: String? { __data["status"] }
          public var title: String? { __data["title"] }
          public var description: String? { __data["description"] }
          public var location: String? { __data["location"] }
          public var startAtUtc: AffineGraphQL.DateTime { __data["startAtUtc"] }
          public var endAtUtc: AffineGraphQL.DateTime { __data["endAtUtc"] }
          public var originalTimezone: String? { __data["originalTimezone"] }
          public var allDay: Bool { __data["allDay"] }
        }
      }
    }
  }
}
