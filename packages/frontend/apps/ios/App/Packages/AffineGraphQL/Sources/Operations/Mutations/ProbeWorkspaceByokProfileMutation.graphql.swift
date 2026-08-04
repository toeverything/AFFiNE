// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ProbeWorkspaceByokProfileMutation: GraphQLMutation {
  public static let operationName: String = "probeWorkspaceByokProfile"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation probeWorkspaceByokProfile($workspaceId: String!, $profileId: ID!) { probeWorkspaceByokProfile(workspaceId: $workspaceId, profileId: $profileId) { __typename profileId probe { __typename kind testedAt errorKind } } }"#
    ))

  public var workspaceId: String
  public var profileId: ID

  public init(
    workspaceId: String,
    profileId: ID
  ) {
    self.workspaceId = workspaceId
    self.profileId = profileId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "profileId": profileId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("probeWorkspaceByokProfile", ProbeWorkspaceByokProfile.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "profileId": .variable("profileId")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ProbeWorkspaceByokProfileMutation.Data.self
    ] }

    public var probeWorkspaceByokProfile: ProbeWorkspaceByokProfile { __data["probeWorkspaceByokProfile"] }

    /// ProbeWorkspaceByokProfile
    ///
    /// Parent Type: `WorkspaceByokProfileType`
    public struct ProbeWorkspaceByokProfile: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProfileType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("profileId", AffineGraphQL.ID.self),
        .field("probe", Probe.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ProbeWorkspaceByokProfileMutation.Data.ProbeWorkspaceByokProfile.self
      ] }

      public var profileId: AffineGraphQL.ID { __data["profileId"] }
      public var probe: Probe { __data["probe"] }

      /// ProbeWorkspaceByokProfile.Probe
      ///
      /// Parent Type: `WorkspaceByokProbeType`
      public struct Probe: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("kind", String.self),
          .field("testedAt", AffineGraphQL.DateTime?.self),
          .field("errorKind", String?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          ProbeWorkspaceByokProfileMutation.Data.ProbeWorkspaceByokProfile.Probe.self
        ] }

        public var kind: String { __data["kind"] }
        public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
        public var errorKind: String? { __data["errorKind"] }
      }
    }
  }
}
