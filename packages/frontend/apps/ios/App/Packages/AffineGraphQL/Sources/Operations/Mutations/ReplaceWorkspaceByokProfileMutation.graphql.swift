// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ReplaceWorkspaceByokProfileMutation: GraphQLMutation {
  public static let operationName: String = "replaceWorkspaceByokProfile"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation replaceWorkspaceByokProfile($input: ReplaceWorkspaceByokProfileInput!) { replaceWorkspaceByokProfile(input: $input) { __typename profileId } }"#
    ))

  public var input: ReplaceWorkspaceByokProfileInput

  public init(input: ReplaceWorkspaceByokProfileInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("replaceWorkspaceByokProfile", ReplaceWorkspaceByokProfile.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ReplaceWorkspaceByokProfileMutation.Data.self
    ] }

    public var replaceWorkspaceByokProfile: ReplaceWorkspaceByokProfile { __data["replaceWorkspaceByokProfile"] }

    /// ReplaceWorkspaceByokProfile
    ///
    /// Parent Type: `WorkspaceByokProfileType`
    public struct ReplaceWorkspaceByokProfile: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("profileId", AffineGraphQL.ID.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ReplaceWorkspaceByokProfileMutation.Data.ReplaceWorkspaceByokProfile.self
      ] }

      public var profileId: AffineGraphQL.ID { __data["profileId"] }
    }
  }
}
