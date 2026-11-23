// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AddWorkspaceArtifactMutation: GraphQLMutation {
  public static let operationName: String = "addWorkspaceArtifact"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation addWorkspaceArtifact($workspaceId: String!, $blob: Upload!) { addWorkspaceArtifact(workspaceId: $workspaceId, blob: $blob) { __typename artifactId contentHash mediaType size createdAt } }"#
    ))

  public var workspaceId: String
  public var blob: Upload

  public init(
    workspaceId: String,
    blob: Upload
  ) {
    self.workspaceId = workspaceId
    self.blob = blob
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "blob": blob
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("addWorkspaceArtifact", AddWorkspaceArtifact.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "blob": .variable("blob")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      AddWorkspaceArtifactMutation.Data.self
    ] }

    /// Add a workspace artifact
    public var addWorkspaceArtifact: AddWorkspaceArtifact { __data["addWorkspaceArtifact"] }

    /// AddWorkspaceArtifact
    ///
    /// Parent Type: `CopilotWorkspaceArtifact`
    public struct AddWorkspaceArtifact: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotWorkspaceArtifact }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("artifactId", String.self),
        .field("contentHash", String.self),
        .field("mediaType", String.self),
        .field("size", AffineGraphQL.SafeInt.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        AddWorkspaceArtifactMutation.Data.AddWorkspaceArtifact.self
      ] }

      public var artifactId: String { __data["artifactId"] }
      public var contentHash: String { __data["contentHash"] }
      public var mediaType: String { __data["mediaType"] }
      public var size: AffineGraphQL.SafeInt { __data["size"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
    }
  }
}
