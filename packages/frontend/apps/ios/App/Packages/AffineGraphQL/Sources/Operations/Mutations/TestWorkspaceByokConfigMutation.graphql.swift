// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class TestWorkspaceByokConfigMutation: GraphQLMutation {
  public static let operationName: String = "testWorkspaceByokConfig"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation testWorkspaceByokConfig($input: TestWorkspaceByokConfigInput!) { testWorkspaceByokConfig(input: $input) { __typename ok status message } }"#
    ))

  public var input: TestWorkspaceByokConfigInput

  public init(input: TestWorkspaceByokConfigInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("testWorkspaceByokConfig", TestWorkspaceByokConfig.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      TestWorkspaceByokConfigMutation.Data.self
    ] }

    public var testWorkspaceByokConfig: TestWorkspaceByokConfig { __data["testWorkspaceByokConfig"] }

    /// TestWorkspaceByokConfig
    ///
    /// Parent Type: `TestWorkspaceByokConfigResultType`
    public struct TestWorkspaceByokConfig: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.TestWorkspaceByokConfigResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("ok", Bool.self),
        .field("status", GraphQLEnum<AffineGraphQL.ByokKeyTestStatus>.self),
        .field("message", String?.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        TestWorkspaceByokConfigMutation.Data.TestWorkspaceByokConfig.self
      ] }

      public var ok: Bool { __data["ok"] }
      public var status: GraphQLEnum<AffineGraphQL.ByokKeyTestStatus> { __data["status"] }
      public var message: String? { __data["message"] }
    }
  }
}
