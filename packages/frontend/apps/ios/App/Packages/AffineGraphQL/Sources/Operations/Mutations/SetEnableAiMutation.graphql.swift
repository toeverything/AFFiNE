// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SetEnableAiMutation: GraphQLMutation {
  public static let operationName: String = "setEnableAi"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation setEnableAi($id: ID!, $enableAi: Boolean!) { updateWorkspace(input: { id: $id, enableAi: $enableAi }) { __typename id } }"#
    ))

  public var id: ID
  public var enableAi: Bool

  public init(
    id: ID,
    enableAi: Bool
  ) {
    self.id = id
    self.enableAi = enableAi
  }

  public var __variables: Variables? { [
    "id": id,
    "enableAi": enableAi
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateWorkspace", UpdateWorkspace.self, arguments: ["input": [
        "id": .variable("id"),
        "enableAi": .variable("enableAi")
      ]]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SetEnableAiMutation.Data.self
    ] }

    /// Update workspace
    public var updateWorkspace: UpdateWorkspace { __data["updateWorkspace"] }

    /// UpdateWorkspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct UpdateWorkspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        SetEnableAiMutation.Data.UpdateWorkspace.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
    }
  }
}
