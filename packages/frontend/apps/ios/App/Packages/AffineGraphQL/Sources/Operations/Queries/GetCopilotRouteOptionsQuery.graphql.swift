// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetCopilotRouteOptionsQuery: GraphQLQuery {
  public static let operationName: String = "getCopilotRouteOptions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getCopilotRouteOptions($promptName: String!) { currentUser { __typename copilot { __typename routeOptions(promptName: $promptName) { __typename routeId defaultTargetId choices { __typename id displayName minimumTier available } } } } }"#
    ))

  public var promptName: String

  public init(promptName: String) {
    self.promptName = promptName
  }

  public var __variables: Variables? { ["promptName": promptName] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("currentUser", CurrentUser?.self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      GetCopilotRouteOptionsQuery.Data.self
    ] }

    /// Get current user
    public var currentUser: CurrentUser? { __data["currentUser"] }

    /// CurrentUser
    ///
    /// Parent Type: `UserType`
    public struct CurrentUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("copilot", Copilot.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetCopilotRouteOptionsQuery.Data.CurrentUser.self
      ] }

      public var copilot: Copilot { __data["copilot"] }

      /// CurrentUser.Copilot
      ///
      /// Parent Type: `Copilot`
      public struct Copilot: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Copilot }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("routeOptions", RouteOptions?.self, arguments: ["promptName": .variable("promptName")]),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          GetCopilotRouteOptionsQuery.Data.CurrentUser.Copilot.self
        ] }

        /// List native built-in route choices for a prompt
        public var routeOptions: RouteOptions? { __data["routeOptions"] }

        /// CurrentUser.Copilot.RouteOptions
        ///
        /// Parent Type: `CopilotRouteOptions`
        public struct RouteOptions: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotRouteOptions }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("routeId", String.self),
            .field("defaultTargetId", String?.self),
            .field("choices", [Choice].self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            GetCopilotRouteOptionsQuery.Data.CurrentUser.Copilot.RouteOptions.self
          ] }

          public var routeId: String { __data["routeId"] }
          public var defaultTargetId: String? { __data["defaultTargetId"] }
          public var choices: [Choice] { __data["choices"] }

          /// CurrentUser.Copilot.RouteOptions.Choice
          ///
          /// Parent Type: `CopilotRouteTarget`
          public struct Choice: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotRouteTarget }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("id", String.self),
              .field("displayName", String.self),
              .field("minimumTier", String.self),
              .field("available", Bool.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              GetCopilotRouteOptionsQuery.Data.CurrentUser.Copilot.RouteOptions.Choice.self
            ] }

            public var id: String { __data["id"] }
            public var displayName: String { __data["displayName"] }
            public var minimumTier: String { __data["minimumTier"] }
            public var available: Bool { __data["available"] }
          }
        }
      }
    }
  }
}
