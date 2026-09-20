// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ProbeWorkspaceByokDraftMutation: GraphQLMutation {
  public static let operationName: String = "probeWorkspaceByokDraft"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation probeWorkspaceByokDraft($input: ProbeWorkspaceByokDraftInput!) { probeWorkspaceByokDraft(input: $input) { __typename definitionFingerprint stale connection { __typename kind testedAt errorKind } models { __typename modelId checks { __typename operation status { __typename kind testedAt errorKind } } } } }"#
    ))

  public var input: ProbeWorkspaceByokDraftInput

  public init(input: ProbeWorkspaceByokDraftInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("probeWorkspaceByokDraft", ProbeWorkspaceByokDraft.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ProbeWorkspaceByokDraftMutation.Data.self
    ] }

    public var probeWorkspaceByokDraft: ProbeWorkspaceByokDraft { __data["probeWorkspaceByokDraft"] }

    /// ProbeWorkspaceByokDraft
    ///
    /// Parent Type: `WorkspaceByokProbeResultType`
    public struct ProbeWorkspaceByokDraft: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("definitionFingerprint", String.self),
        .field("stale", Bool.self),
        .field("connection", Connection.self),
        .field("models", [Model].self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ProbeWorkspaceByokDraftMutation.Data.ProbeWorkspaceByokDraft.self
      ] }

      public var definitionFingerprint: String { __data["definitionFingerprint"] }
      public var stale: Bool { __data["stale"] }
      public var connection: Connection { __data["connection"] }
      public var models: [Model] { __data["models"] }

      /// ProbeWorkspaceByokDraft.Connection
      ///
      /// Parent Type: `WorkspaceByokProbeStatusType`
      public struct Connection: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeStatusType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("kind", GraphQLEnum<AffineGraphQL.ByokProbeStatusKind>.self),
          .field("testedAt", AffineGraphQL.DateTime?.self),
          .field("errorKind", String?.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          ProbeWorkspaceByokDraftMutation.Data.ProbeWorkspaceByokDraft.Connection.self
        ] }

        public var kind: GraphQLEnum<AffineGraphQL.ByokProbeStatusKind> { __data["kind"] }
        public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
        public var errorKind: String? { __data["errorKind"] }
      }

      /// ProbeWorkspaceByokDraft.Model
      ///
      /// Parent Type: `WorkspaceByokModelProbeType`
      public struct Model: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokModelProbeType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("modelId", String.self),
          .field("checks", [Check].self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          ProbeWorkspaceByokDraftMutation.Data.ProbeWorkspaceByokDraft.Model.self
        ] }

        public var modelId: String { __data["modelId"] }
        public var checks: [Check] { __data["checks"] }

        /// ProbeWorkspaceByokDraft.Model.Check
        ///
        /// Parent Type: `WorkspaceByokModelProbeCheckType`
        public struct Check: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokModelProbeCheckType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("operation", GraphQLEnum<AffineGraphQL.ByokProbeOperation>.self),
            .field("status", Status.self),
          ] }
          public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
            ProbeWorkspaceByokDraftMutation.Data.ProbeWorkspaceByokDraft.Model.Check.self
          ] }

          public var operation: GraphQLEnum<AffineGraphQL.ByokProbeOperation> { __data["operation"] }
          public var status: Status { __data["status"] }

          /// ProbeWorkspaceByokDraft.Model.Check.Status
          ///
          /// Parent Type: `WorkspaceByokProbeStatusType`
          public struct Status: AffineGraphQL.SelectionSet {
            public let __data: DataDict
            public init(_dataDict: DataDict) { __data = _dataDict }

            public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceByokProbeStatusType }
            public static var __selections: [ApolloAPI.Selection] { [
              .field("__typename", String.self),
              .field("kind", GraphQLEnum<AffineGraphQL.ByokProbeStatusKind>.self),
              .field("testedAt", AffineGraphQL.DateTime?.self),
              .field("errorKind", String?.self),
            ] }
            public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
              ProbeWorkspaceByokDraftMutation.Data.ProbeWorkspaceByokDraft.Model.Check.Status.self
            ] }

            public var kind: GraphQLEnum<AffineGraphQL.ByokProbeStatusKind> { __data["kind"] }
            public var testedAt: AffineGraphQL.DateTime? { __data["testedAt"] }
            public var errorKind: String? { __data["errorKind"] }
          }
        }
      }
    }
  }
}
