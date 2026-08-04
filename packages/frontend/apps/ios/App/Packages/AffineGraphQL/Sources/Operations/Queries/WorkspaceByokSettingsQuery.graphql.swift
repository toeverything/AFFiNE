// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class WorkspaceByokSettingsQuery: GraphQLQuery {
  public static let operationName: String = "workspaceByokSettings"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query workspaceByokSettings($id: String!, $from: DateTime!, $to: DateTime!) { workspace(id: $id) { __typename id byokSettings { __typename workspaceId entitled serverEntitled localEntitled allowedProviders customEndpointSupported privateEndpointSupported profiles { __typename profileId provider name description enabled sortOrder definition { __typename version endpoint { __typename kind url } models { __typename modelId capabilities { __typename input output features attachmentKinds attachmentSources } } } probe { __typename kind testedAt errorKind } } } byokUsage(from: $from, to: $to) { __typename date featureKind totalTokens } } }"#
    ))

  public var id: String
  public var from: DateTime
  public var to: DateTime

  public init(
    id: String,
    from: DateTime,
    to: DateTime
  ) {
    self.id = id
    self.from = from
    self.to = to
  }

  public var __variables: Variables? { [
    "id": id,
    "from": from,
    "to": to
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("id")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      WorkspaceByokSettingsQuery.Data.self
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
        .field("id", AffineGraphQL.ID.self),
        .field("byokSettings", ByokSettings.self),
        .field("byokUsage", [ByokUsage].self, arguments: [
          "from": .variable("from"),
          "to": .variable("to")
        ]),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        WorkspaceByokSettingsQuery.Data.Workspace.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var byokSettings: ByokSettings { __data["byokSettings"] }
      public var byokUsage: [ByokUsage] { __data["byokUsage"] }

      /// Workspace.ByokSettings
      ///
      /// Parent Type: `WorkspaceByokSettingsType`
      public struct ByokSettings: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokSettingsType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("workspaceId", String.self),
          .field("entitled", Bool.self),
          .field("serverEntitled", Bool.self),
          .field("localEntitled", Bool.self),
          .field("allowedProviders", [GraphQLEnum<AffineGraphQL.ByokProvider>].self),
          .field("customEndpointSupported", Bool.self),
          .field("privateEndpointSupported", Bool.self),
          .field("profiles", [Profile].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.self
        ] }

        public var workspaceId: String { __data["workspaceId"] }
        public var entitled: Bool { __data["entitled"] }
        public var serverEntitled: Bool { __data["serverEntitled"] }
        public var localEntitled: Bool { __data["localEntitled"] }
        public var allowedProviders: [GraphQLEnum<AffineGraphQL.ByokProvider>] { __data["allowedProviders"] }
        public var customEndpointSupported: Bool { __data["customEndpointSupported"] }
        public var privateEndpointSupported: Bool { __data["privateEndpointSupported"] }
        public var profiles: [Profile] { __data["profiles"] }

        /// Workspace.ByokSettings.Profile
        ///
        /// Parent Type: `WorkspaceByokProfileType`
        public struct Profile: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("profileId", AffineGraphQL.ID.self),
            .field("provider", GraphQLEnum<AffineGraphQL.ByokProvider>.self),
            .field("name", String.self),
            .field("description", String?.self),
            .field("enabled", Bool.self),
            .field("sortOrder", AffineGraphQL.SafeInt.self),
            .field("definition", Definition.self),
            .field("probe", Probe.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.self
          ] }

          public var profileId: AffineGraphQL.ID { __data["profileId"] }
          public var provider: GraphQLEnum<AffineGraphQL.ByokProvider> { __data["provider"] }
          public var name: String { __data["name"] }
          public var description: String? { __data["description"] }
          public var enabled: Bool { __data["enabled"] }
          public var sortOrder: AffineGraphQL.SafeInt { __data["sortOrder"] }
          public var definition: Definition { __data["definition"] }
          public var probe: Probe { __data["probe"] }

          /// Workspace.ByokSettings.Profile.Definition
          ///
          /// Parent Type: `WorkspaceByokProfileDefinitionType`
          public struct Definition: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileDefinitionType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("version", AffineGraphQL.SafeInt.self),
              .field("endpoint", Endpoint.self),
              .field("models", [Model].self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.self
            ] }

            public var version: AffineGraphQL.SafeInt { __data["version"] }
            public var endpoint: Endpoint { __data["endpoint"] }
            public var models: [Model] { __data["models"] }

            /// Workspace.ByokSettings.Profile.Definition.Endpoint
            ///
            /// Parent Type: `WorkspaceByokEndpointType`
            public struct Endpoint: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokEndpointType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("kind", String.self),
                .field("url", String?.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Endpoint.self
              ] }

              public var kind: String { __data["kind"] }
              public var url: String? { __data["url"] }
            }

            /// Workspace.ByokSettings.Profile.Definition.Model
            ///
            /// Parent Type: `WorkspaceByokModelDeclarationType`
            public struct Model: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokModelDeclarationType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("modelId", String.self),
                .field("capabilities", [Capability].self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Model.self
              ] }

              public var modelId: String { __data["modelId"] }
              public var capabilities: [Capability] { __data["capabilities"] }

              /// Workspace.ByokSettings.Profile.Definition.Model.Capability
              ///
              /// Parent Type: `WorkspaceByokCapabilityType`
              public struct Capability: AffineGraphQL.SelectionSet {
                public let __data: DataDict
                public init(_dataDict: DataDict) { __data = _dataDict }

                public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokCapabilityType }
                public static var __selections: [ApolloAPI.Selection] { [
                  .field("__typename", String.self),
                  .field("input", [String].self),
                  .field("output", [String].self),
                  .field("features", [String].self),
                  .field("attachmentKinds", [String].self),
                  .field("attachmentSources", [String].self),
                ] }
                public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                  WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Model.Capability.self
                ] }

                public var input: [String] { __data["input"] }
                public var output: [String] { __data["output"] }
                public var features: [String] { __data["features"] }
                public var attachmentKinds: [String] { __data["attachmentKinds"] }
                public var attachmentSources: [String] { __data["attachmentSources"] }
              }
            }
          }

          /// Workspace.ByokSettings.Profile.Probe
          ///
          /// Parent Type: `WorkspaceByokProbeType`
          public struct Probe: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("kind", String.self),
              .field("testedAt", AffineGraphQL.DateTime?.self),
              .field("errorKind", String?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Probe.self
            ] }

            public var kind: String { __data["kind"] }
            public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
            public var errorKind: String? { __data["errorKind"] }
          }
        }
      }

      /// Workspace.ByokUsage
      ///
      /// Parent Type: `WorkspaceByokUsagePointType`
      public struct ByokUsage: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokUsagePointType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("date", AffineGraphQL.DateTime.self),
          .field("featureKind", String.self),
          .field("totalTokens", AffineGraphQL.SafeInt.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          WorkspaceByokSettingsQuery.Data.Workspace.ByokUsage.self
        ] }

        public var date: AffineGraphQL.DateTime { __data["date"] }
        public var featureKind: String { __data["featureKind"] }
        public var totalTokens: AffineGraphQL.SafeInt { __data["totalTokens"] }
      }
    }
  }
}
