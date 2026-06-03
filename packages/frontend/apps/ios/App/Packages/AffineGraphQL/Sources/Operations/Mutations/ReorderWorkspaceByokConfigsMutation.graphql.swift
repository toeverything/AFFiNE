// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ReorderWorkspaceByokConfigsMutation: GraphQLMutation {
  public static let operationName: String = "reorderWorkspaceByokConfigs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation reorderWorkspaceByokConfigs($input: ReorderWorkspaceByokConfigsInput!) { reorderWorkspaceByokConfigs(input: $input) { __typename id sortOrder } }"#
    ))

  public var input: ReorderWorkspaceByokConfigsInput

  public init(input: ReorderWorkspaceByokConfigsInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("reorderWorkspaceByokConfigs", [ReorderWorkspaceByokConfig].self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ReorderWorkspaceByokConfigsMutation.Data.self
    ] }

    public var reorderWorkspaceByokConfigs: [ReorderWorkspaceByokConfig] { __data["reorderWorkspaceByokConfigs"] }

    /// ReorderWorkspaceByokConfig
    ///
    /// Parent Type: `WorkspaceByokKeyConfigType`
    public struct ReorderWorkspaceByokConfig: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokKeyConfigType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("sortOrder", AffineGraphQL.SafeInt.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ReorderWorkspaceByokConfigsMutation.Data.ReorderWorkspaceByokConfig.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var sortOrder: AffineGraphQL.SafeInt { __data["sortOrder"] }
    }
  }
}
