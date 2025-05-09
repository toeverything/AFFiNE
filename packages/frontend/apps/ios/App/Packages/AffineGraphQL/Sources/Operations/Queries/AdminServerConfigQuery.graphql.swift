// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminServerConfigQuery: GraphQLQuery {
  public static let operationName: String = "adminServerConfig"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminServerConfig { serverConfig { __typename version baseUrl name features type initialized credentialsRequirement { __typename ...CredentialsRequirements } availableUpgrade { __typename changelog version publishedAt url } availableUserFeatures } }"#,
      fragments: [CredentialsRequirements.self, PasswordLimits.self]
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
        .field("version", String.self),
        .field("baseUrl", String.self),
        .field("name", String.self),
        .field("features", [GraphQLEnum<AffineGraphQL.ServerFeature>].self),
        .field("type", GraphQLEnum<AffineGraphQL.ServerDeploymentType>.self),
        .field("initialized", Bool.self),
        .field("credentialsRequirement", CredentialsRequirement.self),
        .field("availableUpgrade", AvailableUpgrade?.self),
        .field("availableUserFeatures", [GraphQLEnum<AffineGraphQL.FeatureType>].self),
      ] }

      /// server version
      public var version: String { __data["version"] }
      /// server base url
      public var baseUrl: String { __data["baseUrl"] }
      /// server identical name could be shown as badge on user interface
      public var name: String { __data["name"] }
      /// enabled server features
      public var features: [GraphQLEnum<AffineGraphQL.ServerFeature>] { __data["features"] }
      /// server type
      public var type: GraphQLEnum<AffineGraphQL.ServerDeploymentType> { __data["type"] }
      /// whether server has been initialized
      public var initialized: Bool { __data["initialized"] }
      /// credentials requirement
      public var credentialsRequirement: CredentialsRequirement { __data["credentialsRequirement"] }
      /// fetch latest available upgradable release of server
      public var availableUpgrade: AvailableUpgrade? { __data["availableUpgrade"] }
      /// Features for user that can be configured
      public var availableUserFeatures: [GraphQLEnum<AffineGraphQL.FeatureType>] { __data["availableUserFeatures"] }

      /// ServerConfig.CredentialsRequirement
      ///
      /// Parent Type: `CredentialsRequirementType`
      public struct CredentialsRequirement: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CredentialsRequirementType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .fragment(CredentialsRequirements.self),
        ] }

        public var password: Password { __data["password"] }

        public struct Fragments: FragmentContainer {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public var credentialsRequirements: CredentialsRequirements { _toFragment() }
        }

        public typealias Password = CredentialsRequirements.Password
      }

      /// ServerConfig.AvailableUpgrade
      ///
      /// Parent Type: `ReleaseVersionType`
      public struct AvailableUpgrade: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ReleaseVersionType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("changelog", String.self),
          .field("version", String.self),
          .field("publishedAt", AffineGraphQL.DateTime.self),
          .field("url", String.self),
        ] }

        public var changelog: String { __data["changelog"] }
        public var version: String { __data["version"] }
        public var publishedAt: AffineGraphQL.DateTime { __data["publishedAt"] }
        public var url: String { __data["url"] }
      }
    }
  }
}
