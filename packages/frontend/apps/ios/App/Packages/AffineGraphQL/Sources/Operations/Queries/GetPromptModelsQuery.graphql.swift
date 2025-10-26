// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetPromptModelsQuery: GraphQLQuery {
  public static let operationName: String = "getPromptModels"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getPromptModels($promptName: String!) { currentUser { __typename copilot { __typename models(promptName: $promptName) { __typename defaultModel optionalModels { __typename id name } proModels { __typename id name } } } } }"#
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
          .field("models", Models.self, arguments: ["promptName": .variable("promptName")]),
        ] }

        /// List available models for a prompt, with human-readable names
        public var models: Models { __data["models"] }

        /// CurrentUser.Copilot.Models
        ///
        /// Parent Type: `CopilotModelsType`
        public struct Models: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotModelsType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("defaultModel", String.self),
            .field("optionalModels", [OptionalModel].self),
            .field("proModels", [ProModel].self),
          ] }

          public var defaultModel: String { __data["defaultModel"] }
          public var optionalModels: [OptionalModel] { __data["optionalModels"] }
          public var proModels: [ProModel] { __data["proModels"] }

          /// CurrentUser.Copilot.Models.OptionalModel
          ///
          /// Parent Type: `CopilotModelType`
          public struct OptionalModel: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotModelType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("id", String.self),
              .field("name", String.self),
            ] }

            public var id: String { __data["id"] }
            public var name: String { __data["name"] }
          }

          /// CurrentUser.Copilot.Models.ProModel
          ///
          /// Parent Type: `CopilotModelType`
          public struct ProModel: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotModelType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("id", String.self),
              .field("name", String.self),
            ] }

            public var id: String { __data["id"] }
            public var name: String { __data["name"] }
          }
        }
      }
    }
  }
}
