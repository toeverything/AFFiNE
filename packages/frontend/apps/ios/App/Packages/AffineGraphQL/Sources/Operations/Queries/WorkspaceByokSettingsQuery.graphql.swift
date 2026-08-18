// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class WorkspaceByokSettingsQuery: GraphQLQuery {
  public static let operationName: String = "workspaceByokSettings"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query workspaceByokSettings($id: String!, $from: DateTime!, $to: DateTime!) { workspace(id: $id) { __typename id byokSettings { __typename workspaceId entitled serverEntitled localEntitled policy { __typename enabled allowedProviders customEndpointMode privateEndpointSupported } catalog { __typename version providers { __typename provider models { __typename modelId displayName recommended capabilities { __typename input output features attachmentKinds attachmentSources } } } } profiles { __typename profileId provider name description enabled sortOrder revision definition { __typename endpoint { __typename kind url dialect } models { __typename modelId enabled capabilities { __typename input output features attachmentKinds attachmentSources } } } validation { __typename definitionFingerprint credentialGeneration connection { __typename kind testedAt errorKind } models { __typename modelId checks { __typename operation status { __typename kind testedAt errorKind } } } } } } byokUsage(from: $from, to: $to) { __typename date featureKind totalTokens } } }"#
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
          .field("policy", Policy.self),
          .field("catalog", Catalog.self),
          .field("profiles", [Profile].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.self
        ] }

        public var workspaceId: String { __data["workspaceId"] }
        public var entitled: Bool { __data["entitled"] }
        public var serverEntitled: Bool { __data["serverEntitled"] }
        public var localEntitled: Bool { __data["localEntitled"] }
        public var policy: Policy { __data["policy"] }
        public var catalog: Catalog { __data["catalog"] }
        public var profiles: [Profile] { __data["profiles"] }

        /// Workspace.ByokSettings.Policy
        ///
        /// Parent Type: `WorkspaceByokPolicyType`
        public struct Policy: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokPolicyType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("enabled", Bool.self),
            .field("allowedProviders", [GraphQLEnum<AffineGraphQL.ByokProvider>].self),
            .field("customEndpointMode", GraphQLEnum<AffineGraphQL.ByokCustomEndpointMode>.self),
            .field("privateEndpointSupported", Bool.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Policy.self
          ] }

          public var enabled: Bool { __data["enabled"] }
          public var allowedProviders: [GraphQLEnum<AffineGraphQL.ByokProvider>] { __data["allowedProviders"] }
          public var customEndpointMode: GraphQLEnum<AffineGraphQL.ByokCustomEndpointMode> { __data["customEndpointMode"] }
          public var privateEndpointSupported: Bool { __data["privateEndpointSupported"] }
        }

        /// Workspace.ByokSettings.Catalog
        ///
        /// Parent Type: `WorkspaceByokCatalogType`
        public struct Catalog: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokCatalogType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("version", String.self),
            .field("providers", [Provider].self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Catalog.self
          ] }

          public var version: String { __data["version"] }
          public var providers: [Provider] { __data["providers"] }

          /// Workspace.ByokSettings.Catalog.Provider
          ///
          /// Parent Type: `WorkspaceByokCatalogProviderType`
          public struct Provider: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokCatalogProviderType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("provider", GraphQLEnum<AffineGraphQL.ByokProvider>.self),
              .field("models", [Model].self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Catalog.Provider.self
            ] }

            public var provider: GraphQLEnum<AffineGraphQL.ByokProvider> { __data["provider"] }
            public var models: [Model] { __data["models"] }

            /// Workspace.ByokSettings.Catalog.Provider.Model
            ///
            /// Parent Type: `WorkspaceByokCatalogModelType`
            public struct Model: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokCatalogModelType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("modelId", String.self),
                .field("displayName", String.self),
                .field("recommended", Bool.self),
                .field("capabilities", [Capability].self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Catalog.Provider.Model.self
              ] }

              public var modelId: String { __data["modelId"] }
              public var displayName: String { __data["displayName"] }
              public var recommended: Bool { __data["recommended"] }
              public var capabilities: [Capability] { __data["capabilities"] }

              /// Workspace.ByokSettings.Catalog.Provider.Model.Capability
              ///
              /// Parent Type: `WorkspaceByokCapabilityType`
              public struct Capability: AffineGraphQL.SelectionSet {
                public let __data: DataDict
                public init(_dataDict: DataDict) { __data = _dataDict }

                public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokCapabilityType }
                public static var __selections: [ApolloAPI.Selection] { [
                  .field("__typename", String.self),
                  .field("input", [GraphQLEnum<AffineGraphQL.ByokModelInput>].self),
                  .field("output", [GraphQLEnum<AffineGraphQL.ByokModelOutput>].self),
                  .field("features", [GraphQLEnum<AffineGraphQL.ByokModelFeature>].self),
                  .field("attachmentKinds", [GraphQLEnum<AffineGraphQL.ByokAttachmentKind>].self),
                  .field("attachmentSources", [GraphQLEnum<AffineGraphQL.ByokAttachmentSource>].self),
                ] }
                public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                  WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Catalog.Provider.Model.Capability.self
                ] }

                public var input: [GraphQLEnum<AffineGraphQL.ByokModelInput>] { __data["input"] }
                public var output: [GraphQLEnum<AffineGraphQL.ByokModelOutput>] { __data["output"] }
                public var features: [GraphQLEnum<AffineGraphQL.ByokModelFeature>] { __data["features"] }
                public var attachmentKinds: [GraphQLEnum<AffineGraphQL.ByokAttachmentKind>] { __data["attachmentKinds"] }
                public var attachmentSources: [GraphQLEnum<AffineGraphQL.ByokAttachmentSource>] { __data["attachmentSources"] }
              }
            }
          }
        }

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
            .field("revision", AffineGraphQL.SafeInt.self),
            .field("definition", Definition.self),
            .field("validation", Validation?.self),
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
          public var revision: AffineGraphQL.SafeInt { __data["revision"] }
          public var definition: Definition { __data["definition"] }
          public var validation: Validation? { __data["validation"] }

          /// Workspace.ByokSettings.Profile.Definition
          ///
          /// Parent Type: `WorkspaceByokProfileDefinitionType`
          public struct Definition: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileDefinitionType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("endpoint", Endpoint.self),
              .field("models", [Model].self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.self
            ] }

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
                .field("kind", GraphQLEnum<AffineGraphQL.ByokEndpointKind>.self),
                .field("url", String?.self),
                .field("dialect", GraphQLEnum<AffineGraphQL.ByokOpenAiDialect>?.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Endpoint.self
              ] }

              public var kind: GraphQLEnum<AffineGraphQL.ByokEndpointKind> { __data["kind"] }
              public var url: String? { __data["url"] }
              public var dialect: GraphQLEnum<AffineGraphQL.ByokOpenAiDialect>? { __data["dialect"] }
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
                .field("enabled", Bool.self),
                .field("capabilities", [Capability].self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Model.self
              ] }

              public var modelId: String { __data["modelId"] }
              public var enabled: Bool { __data["enabled"] }
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
                  .field("input", [GraphQLEnum<AffineGraphQL.ByokModelInput>].self),
                  .field("output", [GraphQLEnum<AffineGraphQL.ByokModelOutput>].self),
                  .field("features", [GraphQLEnum<AffineGraphQL.ByokModelFeature>].self),
                  .field("attachmentKinds", [GraphQLEnum<AffineGraphQL.ByokAttachmentKind>].self),
                  .field("attachmentSources", [GraphQLEnum<AffineGraphQL.ByokAttachmentSource>].self),
                ] }
                public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                  WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Definition.Model.Capability.self
                ] }

                public var input: [GraphQLEnum<AffineGraphQL.ByokModelInput>] { __data["input"] }
                public var output: [GraphQLEnum<AffineGraphQL.ByokModelOutput>] { __data["output"] }
                public var features: [GraphQLEnum<AffineGraphQL.ByokModelFeature>] { __data["features"] }
                public var attachmentKinds: [GraphQLEnum<AffineGraphQL.ByokAttachmentKind>] { __data["attachmentKinds"] }
                public var attachmentSources: [GraphQLEnum<AffineGraphQL.ByokAttachmentSource>] { __data["attachmentSources"] }
              }
            }
          }

          /// Workspace.ByokSettings.Profile.Validation
          ///
          /// Parent Type: `WorkspaceByokValidationType`
          public struct Validation: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokValidationType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("definitionFingerprint", String.self),
              .field("credentialGeneration", AffineGraphQL.SafeInt.self),
              .field("connection", Connection.self),
              .field("models", [Model].self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Validation.self
            ] }

            public var definitionFingerprint: String { __data["definitionFingerprint"] }
            public var credentialGeneration: AffineGraphQL.SafeInt { __data["credentialGeneration"] }
            public var connection: Connection { __data["connection"] }
            public var models: [Model] { __data["models"] }

            /// Workspace.ByokSettings.Profile.Validation.Connection
            ///
            /// Parent Type: `WorkspaceByokProbeStatusType`
            public struct Connection: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeStatusType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("kind", GraphQLEnum<AffineGraphQL.ByokProbeStatusKind>.self),
                .field("testedAt", AffineGraphQL.DateTime?.self),
                .field("errorKind", String?.self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Validation.Connection.self
              ] }

              public var kind: GraphQLEnum<AffineGraphQL.ByokProbeStatusKind> { __data["kind"] }
              public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
              public var errorKind: String? { __data["errorKind"] }
            }

            /// Workspace.ByokSettings.Profile.Validation.Model
            ///
            /// Parent Type: `WorkspaceByokModelProbeType`
            public struct Model: AffineGraphQL.SelectionSet {
              public let __data: DataDict
              public init(_dataDict: DataDict) { __data = _dataDict }

              public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokModelProbeType }
              public static var __selections: [ApolloAPI.Selection] { [
                .field("__typename", String.self),
                .field("modelId", String.self),
                .field("checks", [Check].self),
              ] }
              public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Validation.Model.self
              ] }

              public var modelId: String { __data["modelId"] }
              public var checks: [Check] { __data["checks"] }

              /// Workspace.ByokSettings.Profile.Validation.Model.Check
              ///
              /// Parent Type: `WorkspaceByokModelProbeCheckType`
              public struct Check: AffineGraphQL.SelectionSet {
                public let __data: DataDict
                public init(_dataDict: DataDict) { __data = _dataDict }

                public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokModelProbeCheckType }
                public static var __selections: [ApolloAPI.Selection] { [
                  .field("__typename", String.self),
                  .field("operation", GraphQLEnum<AffineGraphQL.ByokProbeOperation>.self),
                  .field("status", Status.self),
                ] }
                public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                  WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Validation.Model.Check.self
                ] }

                public var operation: GraphQLEnum<AffineGraphQL.ByokProbeOperation> { __data["operation"] }
                public var status: Status { __data["status"] }

                /// Workspace.ByokSettings.Profile.Validation.Model.Check.Status
                ///
                /// Parent Type: `WorkspaceByokProbeStatusType`
                public struct Status: AffineGraphQL.SelectionSet {
                  public let __data: DataDict
                  public init(_dataDict: DataDict) { __data = _dataDict }

                  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeStatusType }
                  public static var __selections: [ApolloAPI.Selection] { [
                    .field("__typename", String.self),
                    .field("kind", GraphQLEnum<AffineGraphQL.ByokProbeStatusKind>.self),
                    .field("testedAt", AffineGraphQL.DateTime?.self),
                    .field("errorKind", String?.self),
                  ] }
                  public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
                    WorkspaceByokSettingsQuery.Data.Workspace.ByokSettings.Profile.Validation.Model.Check.Status.self
                  ] }

                  public var kind: GraphQLEnum<AffineGraphQL.ByokProbeStatusKind> { __data["kind"] }
                  public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
                  public var errorKind: String? { __data["errorKind"] }
                }
              }
            }
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
