// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ValidateConfigMutation: GraphQLMutation {
  public static let operationName: String = "validateConfig"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation validateConfig($updates: [UpdateAppConfigInput!]!) { validateAppConfig(updates: $updates) { __typename module key value valid error } }"#
    ))

  public var updates: [UpdateAppConfigInput]

  public init(updates: [UpdateAppConfigInput]) {
    self.updates = updates
  }

  public var __variables: Variables? { ["updates": updates] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("validateAppConfig", [ValidateAppConfig].self, arguments: ["updates": .variable("updates")]),
    ] }

    /// validate app configuration
    public var validateAppConfig: [ValidateAppConfig] { __data["validateAppConfig"] }

    /// ValidateAppConfig
    ///
    /// Parent Type: `AppConfigValidateResult`
    public struct ValidateAppConfig: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AppConfigValidateResult }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("module", String.self),
        .field("key", String.self),
        .field("value", AffineGraphQL.JSON.self),
        .field("valid", Bool.self),
        .field("error", String?.self),
      ] }

      public var module: String { __data["module"] }
      public var key: String { __data["key"] }
      public var value: AffineGraphQL.JSON { __data["value"] }
      public var valid: Bool { __data["valid"] }
      public var error: String? { __data["error"] }
    }
  }
}
