// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CalendarProvidersQuery: GraphQLQuery {
  public static let operationName: String = "calendarProviders"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query calendarProviders { serverConfig { __typename calendarCalDAVProviders { __typename id label requiresAppPassword docsUrl } calendarProviders } }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("serverConfig", ServerConfig.self),
    ] }

    /// server config
    public var serverConfig: ServerConfig { __data["serverConfig"] }

    /// ServerConfig
    ///
    /// Parent Type: `ServerConfigType`
    public struct ServerConfig: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ServerConfigType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("calendarCalDAVProviders", [CalendarCalDAVProvider].self),
        .field("calendarProviders", [GraphQLEnum<AffineGraphQL.CalendarProviderType>].self),
      ] }

      public var calendarCalDAVProviders: [CalendarCalDAVProvider] { __data["calendarCalDAVProviders"] }
      public var calendarProviders: [GraphQLEnum<AffineGraphQL.CalendarProviderType>] { __data["calendarProviders"] }

      /// ServerConfig.CalendarCalDAVProvider
      ///
      /// Parent Type: `CalendarCalDAVProviderPresetObjectType`
      public struct CalendarCalDAVProvider: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CalendarCalDAVProviderPresetObjectType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("id", String.self),
          .field("label", String.self),
          .field("requiresAppPassword", Bool?.self),
          .field("docsUrl", String?.self),
        ] }

        public var id: String { __data["id"] }
        public var label: String { __data["label"] }
        public var requiresAppPassword: Bool? { __data["requiresAppPassword"] }
        public var docsUrl: String? { __data["docsUrl"] }
      }
    }
  }
}
