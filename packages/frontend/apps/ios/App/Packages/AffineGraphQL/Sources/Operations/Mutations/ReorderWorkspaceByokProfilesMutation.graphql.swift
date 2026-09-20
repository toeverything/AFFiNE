// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ReorderWorkspaceByokProfilesMutation: GraphQLMutation {
  public static let operationName: String = "reorderWorkspaceByokProfiles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation reorderWorkspaceByokProfiles($input: ReorderWorkspaceByokProfilesInput!) { reorderWorkspaceByokProfiles(input: $input) { __typename profileId sortOrder revision } }"#
    ))

  public var input: ReorderWorkspaceByokProfilesInput

  public init(input: ReorderWorkspaceByokProfilesInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("reorderWorkspaceByokProfiles", [ReorderWorkspaceByokProfile].self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ReorderWorkspaceByokProfilesMutation.Data.self
    ] }

    public var reorderWorkspaceByokProfiles: [ReorderWorkspaceByokProfile] { __data["reorderWorkspaceByokProfiles"] }

    /// ReorderWorkspaceByokProfile
    ///
    /// Parent Type: `WorkspaceByokProfileType`
    public struct ReorderWorkspaceByokProfile: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("profileId", AffineGraphQL.ID.self),
        .field("sortOrder", AffineGraphQL.SafeInt.self),
        .field("revision", AffineGraphQL.SafeInt.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ReorderWorkspaceByokProfilesMutation.Data.ReorderWorkspaceByokProfile.self
      ] }

      public var profileId: AffineGraphQL.ID { __data["profileId"] }
      public var sortOrder: AffineGraphQL.SafeInt { __data["sortOrder"] }
      public var revision: AffineGraphQL.SafeInt { __data["revision"] }
    }
  }
}
