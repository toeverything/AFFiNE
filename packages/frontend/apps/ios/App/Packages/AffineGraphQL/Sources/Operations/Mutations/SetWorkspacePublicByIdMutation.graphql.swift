// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SetWorkspacePublicByIdMutation: GraphQLMutation {
  public static let operationName: String = "setWorkspacePublicById"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation setWorkspacePublicById($id: ID!, $public: Boolean!) { updateWorkspace(input: { id: $id, public: $public }) { __typename id } }"#
    ))

  public var id: ID
  public var `public`: Bool

  public init(
    id: ID,
    `public`: Bool
  ) {
    self.id = id
    self.`public` = `public`
  }

  public var __variables: Variables? { [
    "id": id,
    "public": `public`
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateWorkspace", UpdateWorkspace.self, arguments: ["input": [
        "id": .variable("id"),
        "public": .variable("public")
      ]]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SetWorkspacePublicByIdMutation.Data.self
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
        SetWorkspacePublicByIdMutation.Data.UpdateWorkspace.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
    }
  }
}
